import type { AffixDef, Slot } from "./types.ts";
import csvRaw from "./affixTable.csv?raw";
import { withDerivedAffixMeta } from "./affixMeta.ts";

const COLS = ["slot", "stat", "label", "pct", "tier", "weight", "min", "max"] as const;

function parse(raw: string): Map<string, AffixDef[]> {
  const bySlot = new Map<string, Map<string, AffixDef>>();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (lines.length && lines[0].startsWith("slot,")) lines.shift();

  for (const line of lines) {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    COLS.forEach((col, index) => (row[col] = (cells[index] ?? "").trim()));

    let slotMap = bySlot.get(row.slot);
    if (!slotMap) {
      slotMap = new Map<string, AffixDef>();
      bySlot.set(row.slot, slotMap);
    }
    let def = slotMap.get(row.stat);
    if (!def) {
      def = withDerivedAffixMeta({
        stat: row.stat as AffixDef["stat"],
        label: row.label,
        tiers: [],
        pct: row.pct === "1" || row.pct.toLowerCase() === "true",
      });
      slotMap.set(row.stat, def);
    }
    def.tiers.push({
      tier: Number(row.tier),
      weight: Number(row.weight),
      min: Number(row.min),
      max: Number(row.max),
    });
  }

  const pools = new Map<string, AffixDef[]>();
  for (const [slot, slotMap] of bySlot) pools.set(slot, [...slotMap.values()]);
  return pools;
}

const POOLS = parse(csvRaw);

export function affixPool(slot: Slot): AffixDef[] {
  return POOLS.get(slot) ?? [];
}
