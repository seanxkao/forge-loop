import type {
  Affix,
  AffixDef,
  AffixTier,
  CoreItem,
  Equipment,
  FilterEntry,
  GameState,
  Item,
  RecipeDef,
} from "./types.ts";
import { CORE_RECIPE } from "./content.ts";
import { passesFilterEntries } from "./filter.ts";
import {
  type MachineCoreEffects,
  boostAffixTier,
  rollTierValue,
  weightedAffixPool,
} from "./machineCores.ts";
import {
  rollCoreRarity,
  rollCoreVariableAffixCount,
  rollEquipmentAffixCount,
  rollEquipmentRarity,
} from "./rarity.ts";

function rollTier(def: AffixDef, rng: () => number = Math.random, luckyTierChance = 0): AffixTier {
  const total = def.tiers.reduce((a, t) => a + t.weight, 0);
  const rollOnce = (): AffixTier => {
    let r = rng() * total;
    for (const t of def.tiers) {
      r -= t.weight;
      if (r < 0) return t;
    }
    return def.tiers[def.tiers.length - 1];
  };
  const first = rollOnce();
  if (luckyTierChance <= 0 || rng() >= luckyTierChance) return first;
  const second = rollOnce();
  return second.tier > first.tier ? second : first;
}

function rollOneAffix(def: AffixDef, rng: () => number = Math.random, luckyTierChance = 0): Affix {
  const t = rollTier(def, rng, luckyTierChance);
  if (def.stat === "atk") {
    return {
      stat: def.stat,
      value: t.min,
      valueMax: t.max,
      label: def.label,
      pct: def.pct,
      tier: t.tier,
      tags: def.tags,
      fixed: def.fixed,
    };
  }
  return {
    stat: def.stat,
    value: rollTierValue(t.min, t.max, !!def.pct, rng),
    label: def.label,
    pct: def.pct,
    tier: t.tier,
    tags: def.tags,
    fixed: def.fixed,
  };
}

function rollAffixes(
  pool: AffixDef[],
  count: number,
  upgradeTierChance: number,
  rng: () => number = Math.random,
  luckyTierChance = 0,
): Affix[] {
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

/** 依該行過濾器分流：符合進主背包、否則進倉庫。 */
function route(state: GameState, item: Item, filter: FilterEntry[]): void {
  if (passesFilterEntries(filter, item)) state.equipmentInv.push(item);
  else state.warehouseInv.push(item);
}

/** 產出並收納一件裝備（依該行機台效果獨立重骰）。 */
export function emitEquipment(
  state: GameState,
  recipe: RecipeDef,
  effects: MachineCoreEffects,
  filter: FilterEntry[],
): Equipment {
  const pool = weightedAffixPool(recipe.affixPool, effects.tagWeights);
  const rarity = rollEquipmentRarity(effects.rarityBonus);
  const affixCount = rollEquipmentAffixCount(rarity);
  const eq: Equipment = {
    uid: state.nextEquipId++,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    kind: "equipment",
    rarity,
    locked: false,
    slot: recipe.slot,
    base: { ...recipe.base },
    affixes: rollAffixes(pool, affixCount, effects.upgradeTierChance, Math.random, effects.luckyTierChance),
  };
  route(state, eq, filter);
  state.progress.craftedEquipmentOnce = true;
  return eq;
}

/** 產出並收納一顆核心（固定產能詞 + 變動詞，獨立重骰）。 */
export function emitCore(
  state: GameState,
  effects: MachineCoreEffects,
  filter: FilterEntry[],
): CoreItem {
  const pool = weightedAffixPool(CORE_RECIPE.affixPool, effects.tagWeights);
  const rarity = rollCoreRarity(effects.rarityBonus);
  const affixCount = rollCoreVariableAffixCount(rarity);
  const fixedAffix = rollOneAffix(CORE_RECIPE.fixedAffix);
  const rolled = rollAffixes(pool, affixCount, effects.upgradeTierChance, Math.random, effects.luckyTierChance);
  const core: CoreItem = {
    uid: state.nextEquipId++,
    recipeId: CORE_RECIPE.id,
    name: CORE_RECIPE.name,
    icon: CORE_RECIPE.icon,
    kind: "core",
    rarity,
    locked: false,
    slot: "core",
    affixes: [{ ...fixedAffix, fixed: true }, ...rolled],
  };
  route(state, core, filter);
  return core;
}
