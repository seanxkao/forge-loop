import type { AffixDef, AffixStat, Slot } from "./types.ts";
import { withDerivedAffixMeta } from "./affixMeta.ts";

/** 變異詞：無法正常骰／工藝取得，只能由變異「空格」長出；每件最多 1 條、只有 2 階。
 *  數值以 min==max 寫死（每階確定值）。tag、label、pct 由 affixMeta 衍生（皆含 mutation tag）。 */
function mut(stat: AffixStat, t1: number, t2: number): AffixDef {
  return withDerivedAffixMeta({
    stat,
    tiers: [
      { tier: 1, weight: 1, min: t1, max: t1 },
      { tier: 2, weight: 1, min: t2, max: t2 },
    ],
  });
}

const POOLS: Record<Slot, AffixDef[]> = {
  // 武器：二連擊（20%／30% 機率，第二擊以 10× 速度打出）
  weapon: [mut("mutDoubleStrike", 0.2, 0.3)],
  // 防具：最大生命 +20%／30%；低於 50% 血時更多秒回 +50%／100%
  armor: [mut("mutMaxHpPct", 0.2, 0.3), mut("mutLowHpRegen", 0.5, 1.0)],
  // 飾品：暴擊時回 1%／2% 生命；增幅同件其他詞綴效果 +20%／30%
  accessory: [mut("mutCritHeal", 0.01, 0.02), mut("mutAmplify", 0.2, 0.3)],
};

const MUTATION_STATS = new Set<AffixStat>(
  Object.values(POOLS).flatMap((defs) => defs.map((d) => d.stat)),
);

export function mutationPool(slot: Slot): AffixDef[] {
  return POOLS[slot] ?? [];
}

export function mutationDef(slot: Slot, stat: AffixStat): AffixDef | undefined {
  return (POOLS[slot] ?? []).find((d) => d.stat === stat);
}

export function isMutationStat(stat: AffixStat): boolean {
  return MUTATION_STATS.has(stat);
}
