import type { GameState, Affix, Equipment, Slot } from "./types.ts";
import { spend } from "./inventory.ts";
import { DISMANTLER } from "./content.ts";
import { researchStageGrowthFactor } from "./reincarnation.ts";
import { totalMachinePurchaseCost } from "./machineCosts.ts";

const BASE_STAGE_BASE_COST = 5;
const BASE_STRENGTH_PER_STAGE = 0.2;

export function baseStageCost(state: GameState, stages: number): number {
  return Math.max(1, Math.round(BASE_STAGE_BASE_COST * researchStageGrowthFactor(state) ** stages));
}

export function baseBonus(state: GameState, slot: Slot): number {
  return BASE_STRENGTH_PER_STAGE * (state.baseResearch[slot] ?? 0);
}

export function baseItemsAvailable(state: GameState, slot: Slot): number {
  return state.baseResearchPoints[slot] ?? 0;
}

function addBaseResearchProgress(state: GameState, slot: Slot, value: number): void {
  state.baseResearchPoints[slot] = (state.baseResearchPoints[slot] ?? 0) + value;
  let stages = state.baseResearch[slot] ?? 0;
  while (state.baseResearchPoints[slot] >= baseStageCost(state, stages)) {
    state.baseResearchPoints[slot] -= baseStageCost(state, stages);
    stages += 1;
  }
  state.baseResearch[slot] = stages;
}

export function researchBase(state: GameState, slot: Slot): boolean {
  addBaseResearchProgress(state, slot, 1);
  return true;
}

const STAGE_BASE_COST = 50;
const RESEARCH_PER_TIER = 10;
const STRENGTH_PER_STAGE = 0.1;
export const DISMANTLE_CYCLE = 2;

export function stageCost(state: GameState, stages: number): number {
  return Math.max(1, Math.round(STAGE_BASE_COST * researchStageGrowthFactor(state) ** stages));
}

export function affixResearchValue(aff: Affix): number {
  return aff.tier >= 3 ? (aff.tier - 2) * RESEARCH_PER_TIER : 0;
}

export function strengthBonus(state: GameState, stat: string): number {
  return STRENGTH_PER_STAGE * (state.research.stages[stat] ?? 0);
}

export function addResearch(state: GameState, stat: string, value: number): void {
  const r = state.research;
  r.points[stat] = (r.points[stat] ?? 0) + value;
  let stages = r.stages[stat] ?? 0;
  while (r.points[stat] >= stageCost(state, stages)) {
    r.points[stat] -= stageCost(state, stages);
    stages += 1;
  }
  r.stages[stat] = stages;
}

export function dismantleableCount(state: GameState): number {
  return state.warehouseInv.length;
}

export function craftDismantler(state: GameState): boolean {
  if (!spend(state, totalMachinePurchaseCost(DISMANTLER.buildCost, state.dismantler.count, 1))) return false;
  state.dismantler.count += 1;
  state.dismantler.active += 1;
  return true;
}

export function setDismActive(state: GameState, delta: number): void {
  const d = state.dismantler;
  d.active = Math.max(0, Math.min(d.count, d.active + delta));
}

export function tickDismantler(state: GameState, dt: number): void {
  const d = state.dismantler;
  if (d.active <= 0 || state.warehouseInv.length <= 0) {
    d.progress = 0;
    return;
  }

  d.progress += dt * d.active;
  if (d.progress < DISMANTLE_CYCLE) return;

  while (d.progress >= DISMANTLE_CYCLE && state.warehouseInv.length > 0) {
    const eq = state.warehouseInv.shift() as Equipment;
    addBaseResearchProgress(state, eq.slot, 1);
    for (const aff of eq.affixes) {
      const v = affixResearchValue(aff);
      if (v > 0) addResearch(state, aff.stat, v);
    }
    d.progress -= DISMANTLE_CYCLE;
  }

  if (state.warehouseInv.length <= 0) d.progress = 0;
}
