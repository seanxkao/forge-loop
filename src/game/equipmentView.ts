import type { Equipment, GameState, Slot, StatBlock } from "./types.ts";
import { baseBonus, strengthBonus } from "./progression.ts";

export type EquipmentViewKey = keyof StatBlock | "physicalDamage";

export interface EquipmentViewRow {
  key: EquipmentViewKey;
  label: string;
  value: number;
  pct: boolean;
  delta?: number;
}

const STAT_LABELS: Record<EquipmentViewKey, string> = {
  physicalDamage: "物理傷害",
  hp: "生命",
  atk: "點傷",
  localPhysPct: "本地物理",
  def: "防禦",
  critChance: "暴擊",
  critMult: "暴傷",
  haste: "攻速",
  hpRegen: "回血",
  dmgReductionPct: "減傷",
  blockChance: "格檔率",
};

const PCT_KEYS = new Set<EquipmentViewKey>([
  "localPhysPct",
  "critChance",
  "critMult",
  "haste",
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
];

export function getEquipmentSummaryRows(state: GameState, eq: Equipment): EquipmentViewRow[] {
  const baseValues = getEquipmentBaseValues(state, eq);
  const affixValues = getEquipmentAffixValues(state, eq);
  const values = eq.slot === "weapon" ? affixValues : mergeValues(baseValues, affixValues);
  const rows: EquipmentViewRow[] = [];

  if (eq.slot === "weapon") {
    rows.push(makeRow("physicalDamage", getWeaponPhysicalDamage(state, eq)));
  }

  for (const key of ROW_ORDER) {
    if (key === "physicalDamage") continue;
    const value = values[key as keyof StatBlock] ?? 0;
    if (Math.abs(value) <= 1e-9) continue;
    rows.push(makeRow(key, value));
  }

  return rows;
}

export function getEquipmentComparisonRows(
  state: GameState,
  eq: Equipment,
  equipped: Equipment | null,
): EquipmentViewRow[] {
  const currentRows = getEquipmentSummaryRows(state, eq);
  const equippedRows = equipped ? getEquipmentSummaryRows(state, equipped) : [];
  const equippedMap = new Map<EquipmentViewKey, EquipmentViewRow>(
    equippedRows.map((row) => [row.key, row]),
  );
  const seen = new Set<EquipmentViewKey>();
  const rows: EquipmentViewRow[] = [];

  for (const row of currentRows) {
    const compare = equippedMap.get(row.key);
    rows.push({
      ...row,
      delta: row.value - (compare?.value ?? 0),
    });
    seen.add(row.key);
  }

  for (const row of equippedRows) {
    if (seen.has(row.key)) continue;
    rows.push({
      ...makeRow(row.key, 0),
      delta: -row.value,
    });
  }

  return rows;
}

export function getWeaponPhysicalDamage(state: GameState, eq: Equipment): number {
  if (eq.slot !== "weapon") return 0;

  const baseValues = getEquipmentBaseValues(state, eq);
  const affixValues = getEquipmentAffixValues(state, eq);
  const baseAtk = baseValues.atk ?? 0;
  const flatAtk = affixValues.atk ?? 0;
  const localPhysPct = affixValues.localPhysPct ?? 0;
  return (baseAtk + flatAtk) * (1 + localPhysPct);
}

function getEquipmentBaseValues(state: GameState, eq: Equipment): Partial<StatBlock> {
  const values: Partial<StatBlock> = {};
  const baseMult = 1 + baseBonus(state, eq.slot);

  for (const [rawKey, rawValue] of Object.entries(eq.base)) {
    const key = rawKey as keyof StatBlock;
    values[key] = (values[key] ?? 0) + (rawValue as number) * baseMult;
  }

  return values;
}

function getEquipmentAffixValues(state: GameState, eq: Equipment): Partial<StatBlock> {
  const values: Partial<StatBlock> = {};

  for (const affix of eq.affixes) {
    const value = affix.value * (1 + strengthBonus(state, affix.stat));
    values[affix.stat] = (values[affix.stat] ?? 0) + value;
  }

  return values;
}

function mergeValues(
  left: Partial<StatBlock>,
  right: Partial<StatBlock>,
): Partial<StatBlock> {
  const merged: Partial<StatBlock> = { ...left };
  for (const [rawKey, rawValue] of Object.entries(right)) {
    const key = rawKey as keyof StatBlock;
    merged[key] = (merged[key] ?? 0) + (rawValue as number);
  }
  return merged;
}

function makeRow(key: EquipmentViewKey, value: number): EquipmentViewRow {
  return {
    key,
    label: STAT_LABELS[key],
    value,
    pct: PCT_KEYS.has(key),
  };
}

export function findEquippedInSlot(state: GameState, slot: Slot): Equipment | null {
  return state.equipped[slot];
}
