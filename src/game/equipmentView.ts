import type { AffixStat, EquipSlotId, Equipment, GameState, Item, Slot, StatBlock } from "./types.ts";
import { baseBonus } from "./progression.ts";
import { affixLabel, isPctAffix } from "./affixMeta.ts";
import { affixBonusMultiplier } from "./itemAffixes.ts";

export type EquipmentViewKey = AffixStat | "physicalDamage";

export interface EquipmentViewRow {
  key: EquipmentViewKey;
  label: string;
  value: number;
  pct: boolean;
  delta?: number;
}

const HERO_STAT_KEYS = new Set<keyof StatBlock>([
  "hp",
  "atk",
  "localPhysPct",
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
    rows.push(makeRow("physicalDamage", getWeaponPhysicalDamage(state, item)));
  }
  const values = item.kind === "equipment" ? getEquipmentValues(state, item) : getCoreValues(state, item);
  for (const key of ROW_ORDER) {
    if (key === "physicalDamage") continue;
    const value = values[key] ?? 0;
    if (Math.abs(value) <= 1e-9) continue;
    rows.push(makeRow(key, value));
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
    rows.push({ ...row, delta: row.value - (compare?.value ?? 0) });
    seen.add(row.key);
  }
  for (const row of equippedRows) {
    if (seen.has(row.key)) continue;
    rows.push({ ...makeRow(row.key, 0), delta: -row.value });
  }
  return rows;
}

export function getWeaponPhysicalDamage(state: GameState, eq: Equipment): number {
  if (eq.slot !== "weapon") return 0;
  const values = getEquipmentValues(state, eq);
  const baseAtk = values.atk ?? 0;
  const localPhysPct = values.localPhysPct ?? 0;
  return baseAtk * (1 + localPhysPct);
}

function getEquipmentValues(state: GameState, eq: Equipment): Partial<Record<AffixStat, number>> {
  const values: Partial<Record<AffixStat, number>> = {};
  const baseMult = 1 + baseBonus(state, eq.slot);
  for (const [rawKey, rawValue] of Object.entries(eq.base)) {
    const key = rawKey as AffixStat;
    values[key] = (values[key] ?? 0) + (rawValue as number) * baseMult;
  }
  for (const affix of eq.affixes) {
    values[affix.stat] = (values[affix.stat] ?? 0) + affix.value * affixBonusMultiplier(state, eq, affix);
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

function makeRow(key: EquipmentViewKey, value: number): EquipmentViewRow {
  return {
    key,
    label: key === "physicalDamage" ? "總物理傷害" : affixLabel(key),
    value,
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
