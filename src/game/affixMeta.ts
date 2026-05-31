import type { AffixDef, AffixStat, AffixTag } from "./types.ts";

const TAGS: Record<AffixStat, AffixTag[]> = {
  atk: ["physical"],
  localPhysPct: ["physical"],
  critChance: ["crit"],
  critMult: ["crit"],
  haste: ["speed"],
  hp: ["life"],
  hpRegen: ["life"],
  def: ["defense"],
  dmgReductionPct: ["defense"],
  blockChance: ["defense"],
  materialDropPct: [],
  productivity: ["craft"],
  machineSpeedPct: ["speed"],
  materialRefundPct: [],
  upgradeTierChance: ["craft"],
  rarityBonus: ["craft"],
  weightPhysical: ["physical", "craft"],
  weightCrit: ["crit", "craft"],
  weightSpeed: ["speed", "craft"],
  weightLife: ["life", "craft"],
  weightDefense: ["defense", "craft"],
  weightCraft: ["craft"],
};

const LABELS: Record<AffixStat, string> = {
  atk: "攻擊",
  localPhysPct: "武器物傷%",
  critChance: "暴擊率",
  critMult: "暴擊傷害",
  haste: "攻速",
  hp: "生命",
  hpRegen: "回血",
  def: "防禦",
  dmgReductionPct: "減傷",
  blockChance: "格擋率",
  materialDropPct: "素材掉落",
  productivity: "產能",
  machineSpeedPct: "製裝速度",
  materialRefundPct: "返還材料",
  upgradeTierChance: "提升詞綴階級",
  rarityBonus: "增加稀有度",
  weightPhysical: "增加物理權重",
  weightCrit: "增加暴擊權重",
  weightSpeed: "增加速度權重",
  weightLife: "增加生命權重",
  weightDefense: "增加防禦權重",
  weightCraft: "增加工藝權重",
};

const PCT_STATS = new Set<AffixStat>([
  "localPhysPct",
  "critChance",
  "critMult",
  "haste",
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
