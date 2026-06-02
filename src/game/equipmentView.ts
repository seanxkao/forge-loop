import type { AffixStat, EquipSlotId, Equipment, GameState, Item, ItemRarity, Slot, StatBlock } from "./types.ts";
import { baseBonus } from "./progression.ts";
import { affixLabel, isPctAffix } from "./affixMeta.ts";
import { affixBonusMultiplier } from "./itemAffixes.ts";
import { HERO_BASE, HERO_BASE_INTERVAL } from "./heroBase.ts";

export type EquipmentViewKey = AffixStat | "physicalDamage";

export interface EquipmentViewRow {
  key: EquipmentViewKey;
  label: string;
  value: number;
  valueMax?: number;
  pct: boolean;
  delta?: number;
  deltaMax?: number;
}

const HERO_STAT_KEYS = new Set<keyof StatBlock>([
  "hp",
  "atkMin",
  "atkMax",
  "localPhysPct",
  "localHastePct",
  "def",
  "critChance",
  "critMult",
  "haste",
  "hpRegen",
  "dmgReductionPct",
  "blockChance",
]);

const ROW_ORDER: EquipmentViewKey[] = [
  "physicalDamage",
  "hp",
  "atk",
  "localPhysPct",
  "localHastePct",
  "def",
  "critChance",
  "critMult",
  "haste",
  "hpRegen",
  "dmgReductionPct",
  "blockChance",
  "materialDropPct",
  "productivity",
  "machineSpeedPct",
  "materialRefundPct",
  "upgradeTierChance",
  "rarityBonus",
  "weightPhysical",
  "weightCrit",
  "weightSpeed",
  "weightLife",
  "weightDefense",
  "weightCraft",
];

export function getEquipmentSummaryRows(state: GameState, item: Item): EquipmentViewRow[] {
  const rows: EquipmentViewRow[] = [];
  if (item.kind === "equipment" && item.slot === "weapon") {
    const dmg = getWeaponPhysicalDamage(state, item);
    rows.push(makeRow("physicalDamage", dmg.min, dmg.max));
  }
  const values = item.kind === "equipment" ? getEquipmentValues(state, item) : getCoreValues(state, item);
  for (const key of ROW_ORDER) {
    if (key === "physicalDamage") continue;
    const value = key === "atk" ? (values.atkMin ?? 0) : (values[key] ?? 0);
    const valueMax = key === "atk" ? (values.atkMax ?? values.atkMin ?? 0) : undefined;
    if (Math.abs(value) <= 1e-9) continue;
    rows.push(makeRow(key, value, valueMax));
  }
  return rows;
}

export function getEquipmentComparisonRows(
  state: GameState,
  item: Item,
  equipped: Item | null,
): EquipmentViewRow[] {
  const currentRows = getEquipmentSummaryRows(state, item);
  const equippedRows = equipped ? getEquipmentSummaryRows(state, equipped) : [];
  const equippedMap = new Map<EquipmentViewKey, EquipmentViewRow>(equippedRows.map((row) => [row.key, row]));
  const seen = new Set<EquipmentViewKey>();
  const rows: EquipmentViewRow[] = [];
  for (const row of currentRows) {
    const compare = equippedMap.get(row.key);
    rows.push({
      ...row,
      delta: row.value - (compare?.value ?? 0),
      deltaMax: (row.valueMax ?? row.value) - (compare?.valueMax ?? compare?.value ?? 0),
    });
    seen.add(row.key);
  }
  for (const row of equippedRows) {
    if (seen.has(row.key)) continue;
    rows.push({ ...makeRow(row.key, 0), delta: -row.value });
  }
  return rows;
}

export function getWeaponPhysicalDamage(state: GameState, eq: Equipment): { min: number; max: number } {
  if (eq.slot !== "weapon") return { min: 0, max: 0 };
  const values = getEquipmentValues(state, eq);
  const baseAtkMin = values.atkMin ?? 0;
  const baseAtkMax = values.atkMax ?? 0;
  const localPhysPct = values.localPhysPct ?? 0;
  return {
    min: baseAtkMin * (1 + localPhysPct),
    max: baseAtkMax * (1 + localPhysPct),
  };
}

/** 武器物理 DPS：以「預設英雄基底 + 此武器的攻速／暴擊詞綴（含研究加成）」估算，
 *  計入暴擊期望與攻速，不含符文、技能、轉生 power 等 buff。 */
export function getWeaponPhysicalDps(state: GameState, eq: Equipment): number {
  if (eq.slot !== "weapon") return 0;
  const dmg = getWeaponPhysicalDamage(state, eq);
  const avgHit = (dmg.min + dmg.max) / 2;
  const values = getEquipmentValues(state, eq);
  const haste = HERO_BASE.haste + (values.haste ?? 0);
  const localHaste = HERO_BASE.localHastePct + (values.localHastePct ?? 0);
  const interval = HERO_BASE_INTERVAL / ((1 + haste) * (1 + localHaste));
  const attacksPerSec = interval > 0 ? 1 / interval : 0;
  const critChance = Math.min(1, HERO_BASE.critChance + (values.critChance ?? 0));
  const critMult = HERO_BASE.critMult + (values.critMult ?? 0);
  const critFactor = 1 + critChance * (critMult - 1);
  return avgHit * attacksPerSec * critFactor;
}

const RARITY_RANK: Record<ItemRarity, number> = { normal: 0, magic: 1, rare: 2, legendary: 3 };

/** 排序鍵：物理 DPS、稀有度、變動詞綴數，或任一能力值（取「基底＋全部詞綴」相加後的生效值）。 */
export type ItemSortKey = "physicalDamage" | "rarity" | "affixes" | AffixStat;

/** 取得某道具用於排序的數值。能力值會把固定詞與變動詞相加（含研究加成）。 */
export function getItemSortValue(state: GameState, item: Item, key: ItemSortKey): number {
  if (key === "physicalDamage") {
    return item.kind === "equipment" && item.slot === "weapon" ? getWeaponPhysicalDps(state, item) : 0;
  }
  if (key === "rarity") return RARITY_RANK[item.rarity];
  if (key === "affixes") return item.affixes.filter((a) => !a.fixed).length;
  const values = item.kind === "core" ? getCoreValues(state, item) : getEquipmentValues(state, item);
  if (key === "atk") return ((values.atkMin ?? 0) + (values.atkMax ?? 0)) / 2;
  return (values as Record<string, number>)[key] ?? 0;
}

function getEquipmentValues(state: GameState, eq: Equipment): Record<string, number> {
  const values: Record<string, number> = {};
  const baseMult = 1 + baseBonus(state, eq.slot);
  for (const [rawKey, rawValue] of Object.entries(eq.base)) {
    const key = rawKey;
    values[key] = (values[key] ?? 0) + (rawValue as number) * baseMult;
  }
  for (const affix of eq.affixes) {
    const mult = affixBonusMultiplier(state, eq, affix);
    if (affix.stat === "atk") {
      values.atkMin = (values.atkMin ?? 0) + affix.value * mult;
      values.atkMax = (values.atkMax ?? 0) + (affix.valueMax ?? affix.value) * mult;
    } else {
      values[affix.stat] = (values[affix.stat] ?? 0) + affix.value * mult;
    }
  }
  return values;
}

function getCoreValues(state: GameState, item: Item): Partial<Record<AffixStat, number>> {
  const values: Partial<Record<AffixStat, number>> = {};
  for (const affix of item.affixes) {
    values[affix.stat] = (values[affix.stat] ?? 0) + affix.value * affixBonusMultiplier(state, item, affix);
  }
  return values;
}

function makeRow(key: EquipmentViewKey, value: number, valueMax?: number): EquipmentViewRow {
  return {
    key,
    label: key === "physicalDamage" ? "總物理傷害" : affixLabel(key),
    value,
    valueMax,
    pct: key === "physicalDamage" ? false : isPctAffix(key),
  };
}

export function findEquippedInSlot(state: GameState, slot: Slot): Equipment | null {
  if (slot === "accessory") return state.equipped.accessory[0];
  return state.equipped[slot];
}

export function findEquippedInEquipSlot(state: GameState, slot: EquipSlotId): Equipment | null {
  if (slot === "weapon") return state.equipped.weapon;
  if (slot === "armor") return state.equipped.armor;
  return state.equipped.accessory[slot === "accessory1" ? 0 : 1];
}

export function isHeroStatKey(stat: AffixStat): stat is keyof StatBlock {
  return HERO_STAT_KEYS.has(stat as keyof StatBlock);
}
