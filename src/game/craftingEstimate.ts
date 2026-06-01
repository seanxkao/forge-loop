import type { Affix, AffixDef, AffixTier, CoreItem, Equipment, GameState, Item, ItemSlot } from "./types.ts";
import { CORE_RECIPE, RECIPES } from "./content.ts";
import { machineCoreEffects, rollTierValue, weightedAffixPool, boostAffixTier } from "./machineCores.ts";
import {
  rollCoreRarity,
  rollCoreVariableAffixCount,
  rollEquipmentAffixCount,
  rollEquipmentRarity,
} from "./rarity.ts";

function rollTier(def: AffixDef, rng: () => number, luckyTierChance = 0): AffixTier {
  const total = def.tiers.reduce((sum, tier) => sum + tier.weight, 0);
  const rollOnce = (): AffixTier => {
    let roll = rng() * total;
    for (const tier of def.tiers) {
      roll -= tier.weight;
      if (roll < 0) return tier;
    }
    return def.tiers[def.tiers.length - 1];
  };
  const first = rollOnce();
  if (luckyTierChance <= 0 || rng() >= luckyTierChance) return first;
  const second = rollOnce();
  return second.tier > first.tier ? second : first;
}

function rollOneAffix(def: AffixDef, rng: () => number, luckyTierChance = 0): Affix {
  const tier = rollTier(def, rng, luckyTierChance);
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
    out.push(rollOneAffix(available.splice(idx, 1)[0], rng, luckyTierChance));
  }
  if (rng() < upgradeTierChance) boostAffixTier(pool, out, rng);
  return out;
}

export function simulateCraftedItem(state: GameState, slot: ItemSlot, rng: () => number = Math.random): Item {
  if (slot === "core") {
    const effects = machineCoreEffects(state, { kind: "coreCrafter", id: CORE_RECIPE.id });
    const pool = weightedAffixPool(CORE_RECIPE.affixPool, effects.tagWeights);
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

  const recipe = RECIPES[slot];
  const effects = machineCoreEffects(state, { kind: "crafter", id: recipe.slot });
  const pool = weightedAffixPool(recipe.affixPool, effects.tagWeights);
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
