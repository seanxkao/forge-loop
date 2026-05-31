// 詞綴表載入器：解析 affixTable.csv（分階長表）成各槽的詞綴定義。
// 詞綴資料的單一事實來源是 affixTable.csv（可用試算表手調）；本檔只負責解析。
import type { AffixDef, Slot } from "./types.ts";
import csvRaw from "./affixTable.csv?raw";
import { withDerivedAffixMeta } from "./affixMeta.ts";

// 欄位順序須與 affixTable.csv 的表頭一致。
const COLS = ["slot", "stat", "label", "pct", "tier", "weight", "min", "max"] as const;

function parse(raw: string): Map<string, AffixDef[]> {
  // slot -> stat -> AffixDef（保留出現順序）
  const bySlot = new Map<string, Map<string, AffixDef>>();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length && lines[0].startsWith("slot,")) lines.shift(); // 丟表頭

  for (const line of lines) {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    COLS.forEach((c, i) => (row[c] = (cells[i] ?? "").trim()));

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

/** 取得某槽的詞綴定義清單（各含分階）。 */
export function affixPool(slot: Slot): AffixDef[] {
  return POOLS.get(slot) ?? [];
}
