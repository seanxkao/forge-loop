import type { BaseResearchSlot, CoreItem, FilterEntry, GameState, Item } from "./types.ts";
import { deriveLegacyItemRarity } from "./rarity.ts";
import { SAVE_VERSION, createInitialState } from "./state.ts";
import { normalizeUnlockProgress } from "./unlocks.ts";
import { countVariableAffixes } from "./itemAffixes.ts";
import { affixLabel, affixTags, isPctAffix } from "./affixMeta.ts";
import { INITIAL_RUNES, RUNE_DEFS } from "./runes.ts";
import { CORE_FIXED_AFFIX, LEGENDARY_CORE_LUCKY_AFFIX } from "./coreContent.ts";

const KEY = "forge-loop-save";
const LEGACY_BLOCK_STAT = "critDmgTakenReductionPct";
const BLOCK_STAT = "blockChance";
const LEGACY_WEAPON_HASTE_STAT = "haste";
const WEAPON_HASTE_STAT = "localHastePct";

function equippedItems(state: GameState): Item[] {
  return [
    state.equipped.weapon,
    state.equipped.armor,
    ...state.equipped.accessory,
  ].flatMap((item) => (item ? [item] : []));
}

/** 全部「現行 schema」會持有道具的位置：背包、倉庫、已裝備、各生產行核心、研究室核心。 */
function allStoredItems(state: GameState): Item[] {
  const items: Item[] = [...state.equipmentInv, ...state.warehouseInv, ...equippedItems(state)];
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) {
      for (const core of row.cores) if (core) items.push(core);
    }
  }
  for (const core of state.lab.cores) if (core) items.push(core);
  return items;
}

function saveReplacer(key: string, value: unknown): unknown {
  if (key === "label" || key === "pct" || key === "tags") return undefined;
  return value;
}

export function save(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state, saveReplacer));
    return true;
  } catch {
    // localStorage 不可用 / 配額滿，靜默忽略
    return false;
  }
}

/** 匯出：把目前狀態序列化成可下載的 JSON 文字。 */
export function exportSaveText(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

/** 匯入：驗證 JSON 後寫入存檔位置（不直接套用，交由重新載入時走 migrate 流程）。成功回 true。 */
export function importSaveText(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return false;
    localStorage.setItem(KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

function normalizeLegacyBlockStat(state: GameState): void {
  for (const item of allStoredItems(state)) {
    for (const affix of item.affixes) {
      if ((affix.stat as string) === LEGACY_BLOCK_STAT) {
        affix.stat = BLOCK_STAT as typeof affix.stat;
      }
    }
  }
  if (LEGACY_BLOCK_STAT in state.research.points) {
    state.research.points[BLOCK_STAT] = state.research.points[LEGACY_BLOCK_STAT];
    delete state.research.points[LEGACY_BLOCK_STAT];
  }
  if (LEGACY_BLOCK_STAT in state.research.stages) {
    state.research.stages[BLOCK_STAT] = state.research.stages[LEGACY_BLOCK_STAT];
    delete state.research.stages[LEGACY_BLOCK_STAT];
  }
}

function normalizeLegacyItemKinds(state: GameState): void {
  for (const item of allStoredItems(state)) {
    const raw = item as { kind?: string; slot?: string; recipeId?: string };
    if (raw.kind === "equipment" || raw.kind === "core") continue;
    raw.kind = raw.slot === "core" || raw.recipeId === "core" ? "core" : "equipment";
  }
}

/** 一次性遷移（priorVersion < 11）：詞綴升階機率改為每詞每骰判定後威力翻倍，
 *  把既有核心已 roll 的 upgradeTierChance 值減半，與新範圍對齊。
 *  （注：原訂 v10 因開發期 HMR 時序，存檔在減半碼上線前已被標記 v10，故改用 v11 重跑一次。） */
function halveUpgradeTierChanceOnce(state: GameState): void {
  for (const item of allStoredItems(state)) {
    if (item.kind !== "core") continue;
    for (const aff of item.affixes) {
      if (aff.stat === "upgradeTierChance") {
        aff.value *= 0.5;
        if (typeof aff.valueMax === "number") aff.valueMax *= 0.5;
      }
    }
  }
}

/** 一次性遷移（priorVersion < 12）：所有點傷加倍（配合敵方血量／防禦 ×2，戰鬥維持中性）。
 *  既有裝備已 roll 的點傷（武器／飾品基底 atkMin/atkMax 與 atk 詞綴）一併加倍，
 *  否則敵方血/防雙倍而舊裝點傷未倍，戰力會被腰斬。 */
function doubleFlatDamageOnce(state: GameState): void {
  for (const item of allStoredItems(state)) {
    if (item.kind !== "equipment") continue;
    const base = item.base as Record<string, number>;
    if (typeof base.atkMin === "number") base.atkMin *= 2;
    if (typeof base.atkMax === "number") base.atkMax *= 2;
    for (const aff of item.affixes) {
      if (aff.stat === "atk") {
        aff.value *= 2;
        if (typeof aff.valueMax === "number") aff.valueMax *= 2;
      }
    }
  }
}

/** 遷移（priorVersion < 14）：研究通貨化改造。原訂 v13，因開發期 HMR 時序使存檔在遷移碼上線前先被標記 v13，改用 v14 重跑；已改為冪等（lab 歸 0、points 清空）故重跑安全。
 *  既有研究室 → 等量拆解機（研究室保留但停用）；其核心移到拆解機免得卡住。
 *  殘餘研究值（research.points／baseResearchPoints）兌換成對應精髓／結晶。 */
function migrateToCurrencyResearch(state: GameState): void {
  state.dismantler.count += state.lab.count;
  for (let i = 0; i < 2; i += 1) {
    if (!state.dismantler.cores[i] && state.lab.cores[i]) {
      state.dismantler.cores[i] = state.lab.cores[i];
      state.lab.cores[i] = null;
    }
  }
  state.lab.count = 0; // 轉移完歸 0（inert）；確保此遷移冪等、重跑不重複加成
  for (const stat in state.research.points) {
    const v = state.research.points[stat];
    if (v > 0) state.essences[stat] = (state.essences[stat] ?? 0) + v;
  }
  state.research.points = {};
  for (const slot of Object.keys(state.baseResearchPoints) as BaseResearchSlot[]) {
    const v = state.baseResearchPoints[slot] ?? 0;
    if (v > 0) state.crystals[slot] = (state.crystals[slot] ?? 0) + v;
  }
  state.baseResearchPoints = { weapon: 0, armor: 0, accessory: 0, core: 0 };
}

/** 既有傳奇核心對齊現行規格：產能固定詞永遠為範圍最高 roll、幸運值更新為現行值。 */
function normalizeLegendaryCores(state: GameState): void {
  const prodMax = Math.max(...CORE_FIXED_AFFIX.tiers.map((t) => t.max));
  const luckyVal = LEGENDARY_CORE_LUCKY_AFFIX.tiers[0].max;
  for (const item of allStoredItems(state)) {
    if (item.kind !== "core" || item.recipeId !== "legendary-core") continue;
    for (const aff of item.affixes) {
      if (aff.stat === "productivity") { aff.value = prodMax; aff.tier = 1; }
      else if (aff.stat === "luckyTierChance") { aff.value = luckyVal; aff.tier = 1; }
    }
  }
}

/** 舊存檔：武器基底以單一 `atk` 欄位儲存（改成 atkMin/atkMax 區間之前）。
 *  轉成 atkMin=atkMax=atk，否則新公式（deriveStats／DPS）讀不到、基底傷害歸零。 */
function normalizeLegacyAtkBase(state: GameState): void {
  for (const item of allStoredItems(state)) {
    if (item.kind !== "equipment") continue;
    const base = item.base as Record<string, number>;
    if (typeof base.atk === "number" && typeof base.atkMin !== "number" && typeof base.atkMax !== "number") {
      base.atkMin = base.atk;
      base.atkMax = base.atk;
      delete base.atk;
    }
  }
}

function normalizeLegacyRarity(state: GameState): void {
  for (const item of allStoredItems(state)) {
    if (item.rarity) continue;
    item.rarity = deriveLegacyItemRarity(item.kind, countVariableAffixes(item));
  }
}

function normalizeLegacyLocks(state: GameState): void {
  for (const item of allStoredItems(state)) item.locked = !!item.locked;
}

function normalizeLegacyAffixLabels(state: GameState): void {
  for (const item of allStoredItems(state)) {
    for (const affix of item.affixes) {
      if (item.kind === "equipment" && item.slot === "weapon" && affix.stat === LEGACY_WEAPON_HASTE_STAT) {
        affix.stat = WEAPON_HASTE_STAT;
      }
      affix.label = affixLabel(affix.stat);
      affix.pct = isPctAffix(affix.stat);
      affix.tags = affixTags(affix.stat);
    }
  }
}

function normalizeLegacyAccessorySlots(state: GameState): void {
  const equipped = state.equipped as GameState["equipped"] | {
    weapon: Item | null;
    armor: Item | null;
    accessory: Item | null;
  };
  if (!Array.isArray(equipped.accessory)) {
    equipped.accessory = [equipped.accessory ?? null, null] as GameState["equipped"]["accessory"];
  }
}

/** 把舊過濾條件（minTier / minVariableAffixes / minRarity）升級成新的「至少/至多」格式。 */
function upgradeFilterEntry(raw: unknown): FilterEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const cmp = e.cmp === "lte" ? "lte" : "gte";
  if (e.kind === "affixTier") {
    return { kind: "affixTier", stat: e.stat as never, cmp, tier: Number(e.tier ?? e.minTier ?? 1) };
  }
  if (e.kind === "minVariableAffixes" || e.kind === "variableAffixes") {
    return { kind: "variableAffixes", cmp, count: Number(e.count ?? 0) };
  }
  if (e.kind === "minRarity" || e.kind === "rarity") {
    return { kind: "rarity", cmp, rarity: (typeof e.rarity === "string" ? e.rarity : "magic") as never };
  }
  return null;
}

function normalizeFilterEntries(state: GameState): void {
  const fix = (arr: unknown): FilterEntry[] => (Array.isArray(arr) ? arr.map(upgradeFilterEntry).filter((e): e is FilterEntry => e !== null) : []);
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) row.filter = fix(row.filter);
  }
  for (const slot of Object.keys(state.bagFilters) as Array<keyof typeof state.bagFilters>) {
    state.bagFilters[slot] = fix(state.bagFilters[slot]);
  }
}

/** 舊存檔的生產行補上新欄位（auto／queue／reserved／paused），避免 undefined。 */
function normalizeProductionRows(state: GameState): void {
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) {
      if (!row.reserved || typeof row.reserved !== "object") row.reserved = {};
      if ((row.recipe as string | null) === "tan") row.recipe = "smelt";
      if ("hide" in row.reserved || "leather" in row.reserved) {
        row.reserved.ore = (row.reserved.ore ?? 0) + (row.reserved.hide ?? 0);
        row.reserved.ingot = (row.reserved.ingot ?? 0) + (row.reserved.leather ?? 0);
        delete row.reserved.hide;
        delete row.reserved.leather;
      }
      if (typeof row.auto !== "boolean") row.auto = true;
      if (typeof row.queue !== "number") row.queue = 0;
      if (typeof row.paused !== "boolean") row.paused = false;
      if (typeof row.machineStep !== "number" || row.machineStep < 1) row.machineStep = 1;
      if (typeof row.orderStep !== "number" || row.orderStep < 1) row.orderStep = 1;
    }
  }
}

function normalizeLegacyLeatherMaterials(state: GameState): void {
  const inv = state.inventory as Record<string, number | undefined>;
  inv.ore = (inv.ore ?? 0) + (inv.hide ?? 0);
  inv.ingot = (inv.ingot ?? 0) + (inv.leather ?? 0);
  delete inv.hide;
  delete inv.leather;
}

function normalizeLegacyLegendaryFlags(state: GameState): void {
  state.progress.recipeGuideSeen = !!state.progress.recipeGuideSeen;
  state.progress.craftedEquipmentOnce = !!state.progress.craftedEquipmentOnce;
  state.progress.bagGuideSeen = !!state.progress.bagGuideSeen;
  state.progress.equippedGuideSeen = !!state.progress.equippedGuideSeen;
  state.progress.grantedLegendaryCore24 = !!state.progress.grantedLegendaryCore24;
  state.progress.grantedLegendaryCore44 = !!state.progress.grantedLegendaryCore44;
}

function normalizeRunes(state: GameState): void {
  state.runes.owned = Array.isArray(state.runes.owned)
    ? state.runes.owned.filter((id): id is keyof typeof RUNE_DEFS => typeof id === "string" && id in RUNE_DEFS)
    : [];
  if (state.runes.owned.length === 0) state.runes.owned = [...INITIAL_RUNES];
  if (!state.runes.selected || !(state.runes.selected in RUNE_DEFS) || !state.runes.owned.includes(state.runes.selected)) {
    state.runes.selected = null;
  }
}

function restoreRuneSelection(state: GameState, saved: unknown): void {
  if (!saved || typeof saved !== "object") return;
  const rawRunes = (saved as Record<string, unknown>).runes;
  if (!rawRunes || typeof rawRunes !== "object") return;
  const rawSelected = (rawRunes as Record<string, unknown>).selected;
  if (typeof rawSelected !== "string" || !(rawSelected in RUNE_DEFS)) return;
  if (!state.runes.owned.includes(rawSelected as keyof typeof RUNE_DEFS)) return;
  state.runes.selected = rawSelected as keyof typeof RUNE_DEFS;
}

/** migrate 前對「原始」存檔的修補：處理 migrate 陣列規則會吃掉的舊欄位。
 *  舊檔 `equipped.accessory` 是單一物件（雙飾品前），先包成 `[item, null]` 以免遺失。 */
function preMigrateNormalize(saved: unknown): void {
  if (!saved || typeof saved !== "object") return;
  const equipped = (saved as Record<string, unknown>).equipped as Record<string, unknown> | undefined;
  if (equipped && "accessory" in equipped && !Array.isArray(equipped.accessory)) {
    equipped.accessory = [equipped.accessory ?? null, null];
  }
}

interface LegacyMachineTotals {
  assemblers: number;
  labCount: number;
  cores: CoreItem[];
}

/** 從「原始」舊存檔抽出舊機台台數與已插核心（供生產系統大改造的遷移換算）。 */
function extractLegacyMachines(saved: unknown): LegacyMachineTotals {
  const totals: LegacyMachineTotals = { assemblers: 0, labCount: 0, cores: [] };
  if (!saved || typeof saved !== "object") return totals;
  const root = saved as Record<string, unknown>;
  const grab = (holder: unknown, into: "assemblers" | "labCount") => {
    if (!holder || typeof holder !== "object") return;
    const h = holder as { count?: unknown; cores?: unknown };
    totals[into] += Number(h.count) || 0;
    if (Array.isArray(h.cores)) {
      for (const core of h.cores) if (core) totals.cores.push(core as CoreItem);
    }
  };
  for (const key of ["machines", "crafters"] as const) {
    const group = root[key];
    if (group && typeof group === "object") {
      for (const m of Object.values(group as Record<string, unknown>)) grab(m, "assemblers");
    }
  }
  grab(root.coreCrafter, "assemblers");
  grab(root.dismantler, "labCount");
  return totals;
}

/** 以「現行 schema（預設值）」為形狀，把舊存檔深層合併進來。 */
function migrate(saved: unknown, def: unknown): unknown {
  if (Array.isArray(def)) return Array.isArray(saved) ? saved : def;
  if (def !== null && typeof def === "object") {
    if (saved === null || typeof saved !== "object" || Array.isArray(saved)) return def;
    const defObj = def as Record<string, unknown>;
    const savedObj = saved as Record<string, unknown>;
    const keys = Object.keys(defObj);
    if (keys.length === 0) return savedObj; // 動態 record：整包沿用
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = k in savedObj ? migrate(savedObj[k], defObj[k]) : defObj[k];
    }
    return out;
  }
  return typeof saved === typeof def ? saved : def;
}

export function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const priorVersion = typeof (parsed as { version?: unknown })?.version === "number" ? (parsed as { version: number }).version : 0;
    preMigrateNormalize(parsed);
    const legacy = extractLegacyMachines(parsed);
    const migrated = migrate(parsed, createInitialState()) as GameState;

    // 生產系統大改造遷移：舊機台台數 → 組裝機庫存、舊拆解機 → 研究室；已插核心退回倉庫。
    migrated.spareAssemblers += legacy.assemblers;
    migrated.lab.count += legacy.labCount;
    for (const core of legacy.cores) migrated.warehouseInv.push(core);
    if (legacy.assemblers > 0 || legacy.labCount > 0) migrated.progress.placedFirstMachine = true;

    normalizeLegacyAccessorySlots(migrated);
    normalizeLegacyItemKinds(migrated);
    normalizeLegacyAtkBase(migrated);
    normalizeLegendaryCores(migrated);
    normalizeLegacyRarity(migrated);
    normalizeLegacyLocks(migrated);
    normalizeLegacyLegendaryFlags(migrated);
    normalizeRunes(migrated);
    normalizeLegacyAffixLabels(migrated);
    normalizeLegacyBlockStat(migrated);
    normalizeLegacyLeatherMaterials(migrated);
    normalizeFilterEntries(migrated);
    normalizeProductionRows(migrated);
    normalizeUnlockProgress(migrated);
    if (priorVersion < 11) halveUpgradeTierChanceOnce(migrated);
    if (priorVersion < 12) doubleFlatDamageOnce(migrated);
    if (priorVersion < 14) migrateToCurrencyResearch(migrated);
    migrated.version = SAVE_VERSION;
    restoreRuneSelection(migrated, parsed);
    return migrated;
  } catch {
    // 解析失敗 / 損毀才重置
    return createInitialState();
  }
}

export function wipe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 忽略
  }
}
