import type { GameState, ReincarnationBuff } from "./types.ts";

const RESEARCH_GROWTH_REDUCTION_PER_STACK = 0.8;
const MATERIAL_MULT_PER_STACK = 1.15;
const POWER_MULT_PER_STACK = 1.1;

export function researchStageGrowthFactor(state: GameState): number {
  return 2 * (RESEARCH_GROWTH_REDUCTION_PER_STACK ** state.reincarnation.buffs.research);
}

export function materialDropMultiplier(state: GameState): number {
  return MATERIAL_MULT_PER_STACK ** state.reincarnation.buffs.materials;
}

export function powerMultiplier(state: GameState): number {
  return POWER_MULT_PER_STACK ** state.reincarnation.buffs.power;
}

export function canReincarnate(state: GameState): boolean {
  return state.reincarnation.gameCleared;
}

export function applyReincarnation(
  state: GameState,
  freshState: GameState,
  buff: ReincarnationBuff,
): GameState {
  const next = freshState;
  next.reincarnation.cycle = state.reincarnation.cycle + 1;
  next.reincarnation.buffs = { ...state.reincarnation.buffs };
  next.reincarnation.buffs[buff] += 1;
  next.runes.owned = [...freshState.runes.owned];
  next.runes.selected = freshState.runes.selected;
  next.progress.recipeGuideSeen = state.progress.recipeGuideSeen;
  next.progress.craftedEquipmentOnce = state.progress.craftedEquipmentOnce;
  next.progress.bagGuideSeen = state.progress.bagGuideSeen;
  next.progress.equippedGuideSeen = state.progress.equippedGuideSeen;
  return next;
}
