import type { AffixDef, AffixStat, AffixTag } from "./types.ts";

const TAGS: Record<AffixStat, AffixTag[]> = {
  atk: ["physical"],
  atkMin: ["physical"],
  atkMax: ["physical"],
  localPhysPct: ["physical"],
  localHastePct: ["speed"],
  critChance: ["crit"],
  critMult: ["crit"],
  haste: ["speed"],
  hp: ["life"],
  hpRegen: ["life"],
  def: ["defense"],
  defPenPct: ["defense"],
  dmgReductionPct: ["defense"],
  blockChance: ["defense"],
  materialDropPct: [],
  productivity: ["craft"],
  machineSpeedPct: ["speed"],
  materialRefundPct: [],
  upgradeTierChance: ["craft"],
  rarityBonus: ["craft"],
  luckyTierChance: ["craft"],
  weightPhysical: ["physical", "craft"],
  weightCrit: ["crit", "craft"],
  weightSpeed: ["speed", "craft"],
  weightLife: ["life", "craft"],
  weightDefense: ["defense", "craft"],
  weightCraft: ["craft"],
  mutDoubleStrike: ["physical", "mutation"],
  mutMaxHpPct: ["life", "mutation"],
  mutLowHpRegen: ["life", "mutation"],
  mutCritHeal: ["crit", "mutation"],
  mutAmplify: ["mutation"],
};

const LABELS: Record<AffixStat, string> = {
  atk: "攻擊",
  atkMin: "??",
  atkMax: "??",
  localPhysPct: "物理點傷%",
  localHastePct: "本地攻速",
  critChance: "暴擊率",
  critMult: "暴擊傷害",
  haste: "攻速",
  hp: "生命",
  hpRegen: "回血",
  def: "防禦",
  defPenPct: "防禦穿透",
  dmgReductionPct: "減傷",
  blockChance: "格擋率",
  materialDropPct: "素材掉落",
  productivity: "產能",
  machineSpeedPct: "機器速度",
  materialRefundPct: "返還材料",
  upgradeTierChance: "詞綴升階機率",
  rarityBonus: "增加稀有度",
  luckyTierChance: "幸運詞綴階級",
  weightPhysical: "增加物理權重",
  weightCrit: "增加暴擊權重",
  weightSpeed: "增加速度權重",
  weightLife: "增加生命權重",
  weightDefense: "增加防禦權重",
  weightCraft: "增加製作權重",
  mutDoubleStrike: "二連擊",
  mutMaxHpPct: "最大生命%",
  mutLowHpRegen: "低血秒回",
  mutCritHeal: "暴擊回血",
  mutAmplify: "詞綴增幅",
};

const PCT_STATS = new Set<AffixStat>([
  "localPhysPct",
  "localHastePct",
  "critChance",
  "critMult",
  "haste",
  "defPenPct",
  "dmgReductionPct",
  "blockChance",
  "materialDropPct",
  "productivity",
  "machineSpeedPct",
  "materialRefundPct",
  "upgradeTierChance",
  "rarityBonus",
  "luckyTierChance",
  "weightPhysical",
  "weightCrit",
  "weightSpeed",
  "weightLife",
  "weightDefense",
  "weightCraft",
  "mutDoubleStrike",
  "mutMaxHpPct",
  "mutLowHpRegen",
  "mutCritHeal",
  "mutAmplify",
]);

export function affixTags(stat: AffixStat): AffixTag[] {
  return TAGS[stat];
}

export function affixLabel(stat: AffixStat): string {
  return LABELS[stat];
}

export function isPctAffix(stat: AffixStat): boolean {
  return PCT_STATS.has(stat);
}

export function withDerivedAffixMeta(
  def: Omit<AffixDef, "label" | "pct" | "tags"> & Partial<Pick<AffixDef, "label" | "pct" | "tags">>,
): AffixDef {
  return {
    ...def,
    label: def.label ?? affixLabel(def.stat),
    pct: def.pct ?? isPctAffix(def.stat),
    tags: def.tags ?? affixTags(def.stat),
  };
}
