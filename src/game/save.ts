import type { GameState, Item } from "./types.ts";
import { deriveLegacyItemRarity } from "./rarity.ts";
import { SAVE_VERSION, createInitialState } from "./state.ts";
import { normalizeUnlockProgress } from "./unlocks.ts";
import { countVariableAffixes } from "./itemAffixes.ts";
import { affixLabel } from "./affixMeta.ts";

const KEY = "forge-loop-save";
const LEGACY_BLOCK_STAT = "critDmgTakenReductionPct";
const BLOCK_STAT = "blockChance";

function equippedItems(state: GameState): Item[] {
  return [
    state.equipped.weapon,
    state.equipped.armor,
    ...state.equipped.accessory,
  ].flatMap((item) => item ? [item] : []);
}

export function save(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // localStorage 不可用 / 配額滿，靜默忽略
  }
}

function normalizeLegacyBlockStat(state: GameState): void {
  const remapAffixes = (list: { affixes: Array<{ stat: string }> }[]) => {
    for (const eq of list) {
      for (const affix of eq.affixes) {
        if (affix.stat === LEGACY_BLOCK_STAT) affix.stat = BLOCK_STAT;
      }
    }
  };

  remapAffixes(state.equipmentInv);
  remapAffixes(state.warehouseInv);
  remapAffixes(equippedItems(state));

  for (const slot of Object.keys(state.filters) as Array<keyof typeof state.filters>) {
    for (const entry of state.filters[slot]) {
      if (entry.kind === "affixTier" && (entry.stat as string) === LEGACY_BLOCK_STAT) {
        entry.stat = BLOCK_STAT as typeof entry.stat;
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
  const normalizeItem = (item: { kind?: string; slot?: string; recipeId?: string } | null | undefined) => {
    if (!item || item.kind === "equipment" || item.kind === "core") return;
    item.kind = item.slot === "core" || item.recipeId === "core" ? "core" : "equipment";
  };

  state.equipmentInv.forEach(normalizeItem);
  state.warehouseInv.forEach(normalizeItem);
  equippedItems(state).forEach(normalizeItem);
  Object.values(state.machines).forEach((machine) => machine.cores.forEach(normalizeItem));
  Object.values(state.crafters).forEach((crafter) => crafter.cores.forEach(normalizeItem));
  state.dismantler.cores.forEach(normalizeItem);
  state.coreCrafter.cores.forEach(normalizeItem);
}

function normalizeLegacyRarity(state: GameState): void {
  const normalizeItem = (item: Item | null | undefined) => {
    if (!item || item.rarity) return;
    item.rarity = deriveLegacyItemRarity(item.kind, countVariableAffixes(item));
  };

  state.equipmentInv.forEach(normalizeItem);
  state.warehouseInv.forEach(normalizeItem);
  equippedItems(state).forEach(normalizeItem);
  Object.values(state.machines).forEach((machine) => machine.cores.forEach(normalizeItem));
  Object.values(state.crafters).forEach((crafter) => crafter.cores.forEach(normalizeItem));
  state.dismantler.cores.forEach(normalizeItem);
  state.coreCrafter.cores.forEach(normalizeItem);
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

function normalizeLegacyFilters(state: GameState): void {
  for (const slot of Object.keys(state.filters) as Array<keyof typeof state.filters>) {
    state.filters[slot] = state.filters[slot].map((entry) => {
      if ("kind" in entry) return entry;
      const legacy = entry as { stat: string; minTier: number };
      return { kind: "affixTier", stat: legacy.stat as never, minTier: legacy.minTier };
    });
  }
}

function normalizeLegacyAffixLabels(state: GameState): void {
  const normalizeItem = (item: Item | null | undefined) => {
    if (!item) return;
    for (const affix of item.affixes) {
      affix.label = affixLabel(affix.stat);
    }
  };

  state.equipmentInv.forEach(normalizeItem);
  state.warehouseInv.forEach(normalizeItem);
  equippedItems(state).forEach(normalizeItem);
  Object.values(state.machines).forEach((machine) => machine.cores.forEach(normalizeItem));
  Object.values(state.crafters).forEach((crafter) => crafter.cores.forEach(normalizeItem));
  state.dismantler.cores.forEach(normalizeItem);
  state.coreCrafter.cores.forEach(normalizeItem);
}

/** 以「現行 schema（預設值）」為形狀，把舊存檔深層合併進來。
 *  - 缺的欄位 → 補預設
 *  - 動態 record（預設為空物件，如庫存、研究點數）→ 整包沿用存檔
 *  - 固定形狀物件 → 逐鍵遞迴合併（丟棄已廢欄位）
 *  - 陣列 → 整包沿用
 *  - 純量型別不符 → 用預設（視為衝突，僅該欄位回退） */
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
    // 不因改版直接清檔：以現行 schema 深層合併遷移舊檔
    const migrated = migrate(JSON.parse(raw), createInitialState()) as GameState;
    normalizeLegacyAccessorySlots(migrated);
    normalizeLegacyItemKinds(migrated);
    normalizeLegacyRarity(migrated);
    normalizeLegacyFilters(migrated);
    normalizeLegacyAffixLabels(migrated);
    normalizeLegacyBlockStat(migrated);
    normalizeUnlockProgress(migrated);
    migrated.version = SAVE_VERSION;
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
