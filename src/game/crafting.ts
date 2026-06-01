import type {
  Affix,
  AffixDef,
  AffixTier,
  CoreItem,
  CrafterState,
  Equipment,
  GameState,
  Item,
  ItemSlot,
  RecipeDef,
  Slot,
} from "./types.ts";
import { RECIPES, CRAFTERS, CORE_MACHINE, CORE_RECIPE } from "./content.ts";
import { spend, add } from "./inventory.ts";
import { passesFilter } from "./filter.ts";
import { totalMachinePurchaseCost } from "./machineCosts.ts";
import {
  boostAffixTier,
  machineCoreEffects,
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
    const def = available.splice(idx, 1)[0];
    out.push(rollOneAffix(def, rng, luckyTierChance));
  }
  if (rng() < upgradeTierChance) boostAffixTier(pool, out, rng);
  return out;
}

function pushCraftedItem(state: GameState, item: Item): void {
  if (passesFilter(state, item)) state.equipmentInv.push(item);
  else state.warehouseInv.push(item);
}

function refundMaterials(state: GameState, cost: Record<string, number>, pct: number): void {
  if (pct <= 0) return;
  for (const [mat, amount] of Object.entries(cost)) {
    const refund = Math.round(amount * pct);
    if (refund > 0) add(state, mat, refund);
  }
}

function craftEquipmentInternal(
  state: GameState,
  recipe: RecipeDef,
  source: CrafterState,
  spendCost: boolean,
): Equipment | null {
  const effects = machineCoreEffects(state, { kind: "crafter", id: recipe.slot });
  const pool = weightedAffixPool(recipe.affixPool, effects.tagWeights);
  if (spendCost && !spend(state, recipe.cost)) return null;
  if (spendCost) refundMaterials(state, recipe.cost, effects.materialRefundPct);
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
  pushCraftedItem(state, eq);
  source.productivity += effects.productivity;
  while (source.productivity >= 1) {
    source.productivity -= 1;
    craftEquipmentInternal(state, recipe, source, false);
  }
  return eq;
}

function craftCoreInternal(state: GameState, spendCost: boolean): CoreItem | null {
  const source = state.coreCrafter;
  const effects = machineCoreEffects(state, { kind: "coreCrafter", id: CORE_RECIPE.id });
  const pool = weightedAffixPool(CORE_RECIPE.affixPool, effects.tagWeights);
  if (spendCost && !spend(state, CORE_RECIPE.cost)) return null;
  if (spendCost) refundMaterials(state, CORE_RECIPE.cost, effects.materialRefundPct);
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
  pushCraftedItem(state, core);
  source.productivity += effects.productivity;
  while (source.productivity >= 1) {
    source.productivity -= 1;
    craftCoreInternal(state, false);
  }
  return core;
}

export function craft(state: GameState, recipeId: string): Equipment | null {
  const recipe = RECIPES[recipeId];
  if (!recipe) return null;
  return craftEquipmentInternal(state, recipe, state.crafters[recipe.slot], true);
}

export function craftCore(state: GameState): CoreItem | null {
  return craftCoreInternal(state, true);
}

export function craftCrafter(state: GameState, slot: Slot): boolean {
  const def = CRAFTERS[slot];
  if (!def) return false;
  const c = state.crafters[slot];
  if (!spend(state, totalMachinePurchaseCost(def.buildCost, c.count, 1))) return false;
  const wasRunning = c.active > 0;
  c.count += 1;
  c.active = wasRunning ? c.count : 0;
  return true;
}

export function craftCoreCrafter(state: GameState): boolean {
  const c = state.coreCrafter;
  if (!spend(state, totalMachinePurchaseCost(CORE_MACHINE.buildCost, c.count, 1))) return false;
  const wasRunning = c.active > 0;
  c.count += 1;
  c.active = wasRunning ? c.count : 0;
  return true;
}

export function toggleCrafterActive(state: GameState, slot: Slot): void {
  const c = state.crafters[slot];
  if (!c) return;
  c.active = c.active > 0 ? 0 : c.count;
}

export function toggleCoreCrafterActive(state: GameState): void {
  const c = state.coreCrafter;
  c.active = c.active > 0 ? 0 : c.count;
}

export function enqueueCraft(state: GameState, slot: ItemSlot, qty: number): void {
  const c = slot === "core" ? state.coreCrafter : state.crafters[slot];
  if (!c) return;
  c.queue = Math.max(0, c.queue + qty);
}

export function clearCraftQueue(state: GameState, slot: ItemSlot): void {
  const c = slot === "core" ? state.coreCrafter : state.crafters[slot];
  if (c) c.queue = 0;
}

function tickCrafterState(
  state: GameState,
  crafter: CrafterState,
  cycleTime: number,
  machineKind: "crafter" | "coreCrafter",
  id: string,
  craftOne: () => Item | null,
  dt: number,
): void {
  const effects = machineCoreEffects(state, { kind: machineKind, id });
  if (crafter.active <= 0 || crafter.queue <= 0) {
    crafter.progress = 0;
    crafter.idle = false;
    return;
  }
  crafter.progress += dt * crafter.active * (1 + effects.machineSpeedPct);
  if (crafter.progress < cycleTime) return;

  const cycles = Math.floor(crafter.progress / cycleTime);
  let made = 0;
  let blocked = false;
  while (made < cycles && crafter.queue > 0) {
    if (!craftOne()) {
      blocked = true;
      break;
    }
    crafter.queue -= 1;
    made += 1;
  }
  if (made > 0) crafter.progress -= cycleTime * made;
  if (blocked) {
    crafter.progress = cycleTime;
    crafter.idle = true;
  } else {
    crafter.idle = false;
    if (crafter.queue <= 0) crafter.progress = 0;
  }
}

export function tickCrafters(state: GameState, dt: number): void {
  for (const slot of ["weapon", "armor", "accessory"] as Slot[]) {
    const c = state.crafters[slot];
    const def = CRAFTERS[slot];
    if (!c || !def) continue;
    tickCrafterState(state, c, def.cycleTime, "crafter", slot, () => craft(state, slot), dt);
  }
  tickCrafterState(
    state,
    state.coreCrafter,
    CORE_MACHINE.cycleTime,
    "coreCrafter",
    CORE_RECIPE.id,
    () => craftCore(state),
    dt,
  );
}
