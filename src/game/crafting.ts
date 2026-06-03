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
import { CORE_RECIPE, RECIPES } from "./content.ts";
import { passesFilterEntries } from "./filter.ts";
import {
  type MachineCoreEffects,
  rollTierValue,
  weightedAffixPool,
} from "./machineCores.ts";
import {
  deriveLegacyItemRarity,
  rollCoreRarity,
  rollCoreVariableAffixCount,
  rollEquipmentAffixCount,
  rollEquipmentRarity,
} from "./rarity.ts";

function rollTier(def: AffixDef, rng: () => number = Math.random, luckyTierChance = 0, upgradeTierChance = 0): AffixTier {
  const total = def.tiers.reduce((a, t) => a + t.weight, 0);
  const rollOnce = (): AffixTier => {
    let r = rng() * total;
    for (const t of def.tiers) {
      r -= t.weight;
      if (r < 0) return t;
    }
    return def.tiers[def.tiers.length - 1];
  };
  // 升階判定：每次 tier roll 各自判定一次（幸運的兩次也分別判定）。
  const maybeUpgrade = (t: AffixTier): AffixTier => {
    if (upgradeTierChance <= 0 || rng() >= upgradeTierChance) return t;
    const idx = def.tiers.findIndex((x) => x.tier === t.tier);
    return idx >= 0 && idx < def.tiers.length - 1 ? def.tiers[idx + 1] : t;
  };
  const first = maybeUpgrade(rollOnce());
  if (luckyTierChance <= 0 || rng() >= luckyTierChance) return first;
  const second = maybeUpgrade(rollOnce());
  return second.tier > first.tier ? second : first;
}

function rollOneAffix(def: AffixDef, rng: () => number = Math.random, luckyTierChance = 0, upgradeTierChance = 0): Affix {
  const t = rollTier(def, rng, luckyTierChance, upgradeTierChance);
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
    out.push(rollOneAffix(available.splice(idx, 1)[0], rng, luckyTierChance, upgradeTierChance));
  }
  return out;
}

/** 任意階（含超出最高定義階）的數值範圍：定義內直接取，超出則以最後兩階的線性差外推。
 *  供變異「升階突破 T8」用；遞增曲線本為線性，故外推保持同步距。 */
export function tierRange(def: AffixDef, tier: number): { min: number; max: number } {
  const exact = def.tiers.find((t) => t.tier === tier);
  if (exact) return { min: exact.min, max: exact.max };
  const sorted = [...def.tiers].sort((a, b) => a.tier - b.tier);
  const top = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2] ?? top;
  const span = top.tier - prev.tier || 1;
  const dMin = (top.min - prev.min) / span;
  const dMax = (top.max - prev.max) / span;
  const k = tier - top.tier;
  return { min: top.min + dMin * k, max: top.max + dMax * k };
}

/** roll 指定 stat 的指定階級（值在該階範圍內 roll）；供工藝重鑄／附加使用。 */
export function rollAffixAtTier(def: AffixDef, tier: number): Affix {
  const t = def.tiers.find((x) => x.tier === tier) ?? def.tiers[0];
  if (def.stat === "atk") {
    return { stat: def.stat, value: t.min, valueMax: t.max, label: def.label, pct: def.pct, tier: t.tier, tags: def.tags, fixed: def.fixed };
  }
  return { stat: def.stat, value: rollTierValue(t.min, t.max, !!def.pct, Math.random), label: def.label, pct: def.pct, tier: t.tier, tags: def.tags, fixed: def.fixed };
}

/** 工藝・重鑄：完全重骰該裝備（稀有度／詞綴數／詞綴全部重來），但必定含 forcedStat@forcedTier。就地修改。 */
export function rerollEquipment(item: Equipment, forcedStat: string, forcedTier: number): void {
  const recipe = RECIPES[item.recipeId] ?? RECIPES[item.slot];
  if (!recipe) return;
  const rarity = rollEquipmentRarity(0);
  const count = rollEquipmentAffixCount(rarity);
  const affixes = rollAffixes(recipe.affixPool, count, 0);
  const def = recipe.affixPool.find((d) => d.stat === forcedStat);
  if (def) {
    const forced = rollAffixAtTier(def, forcedTier);
    const idx = affixes.findIndex((a) => a.stat === forcedStat);
    if (idx >= 0) affixes[idx] = forced;
    else if (affixes.length > 0) affixes[affixes.length - 1] = forced;
    else affixes.push(forced);
  }
  item.rarity = rarity;
  item.affixes = affixes;
}

/** 工藝・附加：把 stat@tier 加到空詞位，標記 augmented；先移除既有 augmented 詞（全裝僅一條）。就地修改。 */
export function augmentEquipment(item: Equipment, stat: string, tier: number): void {
  const recipe = RECIPES[item.recipeId] ?? RECIPES[item.slot];
  const def = recipe?.affixPool.find((d) => d.stat === stat);
  if (!def) return;
  item.affixes = item.affixes.filter((a) => !a.augmented);
  const aff = rollAffixAtTier(def, tier);
  aff.augmented = true;
  item.affixes.push(aff);
  // 依詞綴數更新稀有度（無詞普通 → 魔法等）；傳奇不降級
  if (item.rarity !== "legendary") {
    const count = item.affixes.filter((a) => !a.fixed).length;
    item.rarity = deriveLegacyItemRarity("equipment", count);
  }
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
