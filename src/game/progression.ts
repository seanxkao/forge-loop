import type { BaseResearchSlot, GameState } from "./types.ts";

export const BASE_STRENGTH_PER_STAGE = 0.2;
export const AFFIX_STRENGTH_PER_STAGE = 0.1;

export function baseBonus(state: GameState, slot: BaseResearchSlot): number {
  return BASE_STRENGTH_PER_STAGE * (state.baseResearch[slot] ?? 0);
}

export function strengthBonus(state: GameState, stat: string): number {
  return AFFIX_STRENGTH_PER_STAGE * (state.research.stages[stat] ?? 0);
}
