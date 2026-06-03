import type { GameState, ReincarnationBuff } from "./types.ts";

const RESEARCH_GROWTH_REDUCTION_PER_STACK = 0.8;
const MATERIAL_MULT_PER_STACK = 1.15;
const POWER_MULT_PER_STACK = 1.1;
/** 研究成長率下限（保險）：公式 2^(0.8^N) 本身恆 >1、不會暴走，下限僅防未來公式變動出事。 */
const RESEARCH_GROWTH_MIN = 1.1;

/** 研究升階成長率 = 2^(0.8^N)，N＝研究減免層數；恆 >1（越高等越貴、有界），夾在 ≥1.1。 */
export function researchStageGrowthFactor(state: GameState): number {
  return Math.max(RESEARCH_GROWTH_MIN, 2 ** (RESEARCH_GROWTH_REDUCTION_PER_STACK ** state.reincarnation.buffs.research));
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
  next.progress.trialResearchLayers = state.progress.trialResearchLayers; // 試煉加成上限為終身計
  next.progress.apostleWins = state.progress.apostleWins; // 變異解鎖／次數上限為終身計
  return next;
}
