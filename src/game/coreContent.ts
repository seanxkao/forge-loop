import type { AffixDef, AffixTier, CoreItem, CoreRecipeDef, GameState, MachineDef } from "./types.ts";
import { withDerivedAffixMeta } from "./affixMeta.ts";

function tiers(min: number, max: number): AffixTier[] {
  const width = (max - min) / 8;
  const weights = [268, 168, 105, 66, 41, 26, 16, 10];
  return Array.from({ length: 8 }, (_, index) => ({
    tier: index + 1,
    weight: weights[index],
    min: round(min + width * index),
    max: round(min + width * (index + 1)),
  }));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// 固定詞綴：無 tier 概念，僅在單一範圍內 roll 數值（不分階、不加權）。
export const CORE_FIXED_AFFIX: AffixDef = withDerivedAffixMeta({
  stat: "productivity",
  fixed: true,
  tiers: [{ tier: 1, weight: 1, min: 0.02, max: 0.04 }],
});

export const LEGENDARY_CORE_LUCKY_AFFIX: AffixDef = withDerivedAffixMeta({
  stat: "luckyTierChance",
  fixed: true,
  tiers: [{ tier: 1, weight: 1, min: 0.2, max: 0.2 }],
});

export const CORE_AFFIX_POOL: AffixDef[] = [
  withDerivedAffixMeta({ stat: "machineSpeedPct", tiers: tiers(0.04, 0.32) }),
  withDerivedAffixMeta({ stat: "materialRefundPct", tiers: tiers(0.025, 0.2) }),
  withDerivedAffixMeta({ stat: "upgradeTierChance", tiers: tiers(0.0625, 0.5) }),
  withDerivedAffixMeta({ stat: "rarityBonus", tiers: tiers(0.03, 0.24) }),
  withDerivedAffixMeta({ stat: "weightPhysical", tiers: tiers(0.125, 1) }),
  withDerivedAffixMeta({ stat: "weightCrit", tiers: tiers(0.125, 1) }),
  withDerivedAffixMeta({ stat: "weightSpeed", tiers: tiers(0.125, 1) }),
  withDerivedAffixMeta({ stat: "weightLife", tiers: tiers(0.125, 1) }),
  withDerivedAffixMeta({ stat: "weightDefense", tiers: tiers(0.125, 1) }),
  withDerivedAffixMeta({ stat: "weightCraft", tiers: tiers(0.125, 1) }),
];

export const CORE_MACHINE: MachineDef = {
  id: "coreLathe",
  name: "核心機",
  icon: "◈",
  buildCost: { ingot: 12, leather: 12, crystal: 12 },
  input: { ingot: 2, leather: 2, crystal: 2 },
  output: {},
  cycleTime: 2,
};

export const CORE_RECIPE: CoreRecipeDef = {
  id: "core",
  name: "核心",
  icon: "◈",
  cost: { ingot: 2, leather: 2, crystal: 2 },
  fixedAffix: CORE_FIXED_AFFIX,
  affixPool: CORE_AFFIX_POOL,
};

export const MATERIAL_DROP_AFFIX: AffixDef = withDerivedAffixMeta({
  stat: "materialDropPct",
  tiers: tiers(0.05, 0.4),
});

export function createLegendaryCore(state: GameState, suffix: string): CoreItem {
  return {
    uid: state.nextEquipId++,
    recipeId: "legendary-core",
    name: `傳奇核心${suffix}`,
    icon: "👑",
    kind: "core",
    rarity: "legendary",
    locked: true,
    slot: "core",
    affixes: [
      {
        stat: CORE_FIXED_AFFIX.stat,
        label: CORE_FIXED_AFFIX.label,
        pct: CORE_FIXED_AFFIX.pct,
        tags: CORE_FIXED_AFFIX.tags,
        tier: CORE_FIXED_AFFIX.tiers[0].tier,
        value: CORE_FIXED_AFFIX.tiers[0].max,
        fixed: true,
      },
      {
        stat: LEGENDARY_CORE_LUCKY_AFFIX.stat,
        label: LEGENDARY_CORE_LUCKY_AFFIX.label,
        pct: LEGENDARY_CORE_LUCKY_AFFIX.pct,
        tags: LEGENDARY_CORE_LUCKY_AFFIX.tags,
        tier: 1,
        value: LEGENDARY_CORE_LUCKY_AFFIX.tiers[0].max,
        fixed: true,
      },
    ],
  };
}
