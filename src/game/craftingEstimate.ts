import type { Affix, AffixDef, AffixTier, CoreItem, Equipment, GameState, Item, ItemSlot, RecipeDef } from "./types.ts";
import { CORE_RECIPE, RECIPES } from "./content.ts";
import { machineCoreEffects, rollTierValue, weightedAffixPool, type MachineCoreEffects } from "./machineCores.ts";
import {
  rollCoreRarity,
  rollCoreVariableAffixCount,
  rollEquipmentAffixCount,
  rollEquipmentRarity,
} from "./rarity.ts";

function rollTier(def: AffixDef, rng: () => number, luckyTierChance = 0, upgradeTierChance = 0): AffixTier {
  const total = def.tiers.reduce((sum, tier) => sum + tier.weight, 0);
  const rollOnce = (): AffixTier => {
    let roll = rng() * total;
    for (const tier of def.tiers) {
      roll -= tier.weight;
      if (roll < 0) return tier;
    }
    return def.tiers[def.tiers.length - 1];
  };
  // 升階判定：每次 tier roll 各自判定一次（幸運的兩次也分別判定）。
  const maybeUpgrade = (tier: AffixTier): AffixTier => {
    if (upgradeTierChance <= 0 || rng() >= upgradeTierChance) return tier;
    const idx = def.tiers.findIndex((x) => x.tier === tier.tier);
    return idx >= 0 && idx < def.tiers.length - 1 ? def.tiers[idx + 1] : tier;
  };
  const first = maybeUpgrade(rollOnce());
  if (luckyTierChance <= 0 || rng() >= luckyTierChance) return first;
  const second = maybeUpgrade(rollOnce());
  return second.tier > first.tier ? second : first;
}

function rollOneAffix(def: AffixDef, rng: () => number, luckyTierChance = 0, upgradeTierChance = 0): Affix {
  const tier = rollTier(def, rng, luckyTierChance, upgradeTierChance);
  return {
    stat: def.stat,
    value: rollTierValue(tier.min, tier.max, !!def.pct, rng),
    label: def.label,
    pct: def.pct,
    tier: tier.tier,
    tags: def.tags,
    fixed: def.fixed,
  };
}

function rollAffixes(pool: AffixDef[], count: number, upgradeTierChance: number, rng: () => number, luckyTierChance = 0): Affix[] {
  const available = [...pool];
  const out: Affix[] = [];
  const cappedCount = Math.min(count, available.length);
  for (let i = 0; i < cappedCount; i += 1) {
    const idx = Math.floor(rng() * available.length);
    out.push(rollOneAffix(available.splice(idx, 1)[0], rng, luckyTierChance, upgradeTierChance));
  }
  return out;
}

/** 取樣前的「整輪不變」準備：核心效果與加權後的詞綴池只需算一次。 */
export interface SimContext {
  isCore: boolean;
  recipe: RecipeDef | null;
  effects: MachineCoreEffects;
  pool: AffixDef[];
}

/** 計算一次取樣所需的常量（核心效果、加權詞綴池）。在取樣迴圈外呼叫一次即可。 */
export function prepareSimulation(
  state: GameState,
  slot: ItemSlot,
  cores: ReadonlyArray<CoreItem | null> = [],
): SimContext {
  const effects = machineCoreEffects(state, cores);
  if (slot === "core") {
    return { isCore: true, recipe: null, effects, pool: weightedAffixPool(CORE_RECIPE.affixPool, effects.tagWeights) };
  }
  const recipe = RECIPES[slot];
  return { isCore: false, recipe, effects, pool: weightedAffixPool(recipe.affixPool, effects.tagWeights) };
}

/** 以預備好的 context 產生一件模擬道具（每輪輕量；不重建詞綴池）。 */
export function simulateFromContext(ctx: SimContext, rng: () => number = Math.random): Item {
  const { effects, pool } = ctx;
  if (ctx.isCore) {
    const rarity = rollCoreRarity(effects.rarityBonus, rng);
    const affixCount = rollCoreVariableAffixCount(rarity, rng);
    const fixedAffix = rollOneAffix(CORE_RECIPE.fixedAffix, rng);
    const item: CoreItem = {
      uid: 0,
      recipeId: CORE_RECIPE.id,
      name: CORE_RECIPE.name,
      icon: CORE_RECIPE.icon,
      kind: "core",
      rarity,
      locked: false,
      slot: "core",
      affixes: [{ ...fixedAffix, fixed: true }, ...rollAffixes(pool, affixCount, effects.upgradeTierChance, rng, effects.luckyTierChance)],
    };
    return item;
  }

  const recipe = ctx.recipe!;
  const rarity = rollEquipmentRarity(effects.rarityBonus, rng);
  const affixCount = rollEquipmentAffixCount(rarity, rng);
  const item: Equipment = {
    uid: 0,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    kind: "equipment",
    rarity,
    locked: false,
    slot: recipe.slot,
    base: { ...recipe.base },
    affixes: rollAffixes(pool, affixCount, effects.upgradeTierChance, rng, effects.luckyTierChance),
  };
  return item;
}

export function simulateCraftedItem(
  state: GameState,
  slot: ItemSlot,
  cores: ReadonlyArray<CoreItem | null> = [],
  rng: () => number = Math.random,
): Item {
  return simulateFromContext(prepareSimulation(state, slot, cores), rng);
}
