import { STAGES, PROD_RECIPES, findStage } from "./content.ts";
import type { AffixStat, CoreItem, GameState, Item, RecipeId } from "./types.ts";

export const CORE_UNLOCK_STAGE_INDEX = 7;
/** 通關 1-4（清掉 s4 → 解鎖 s5）後，unlockedStageCount ≥ 5。 */
export const ZONE1_CLEARED_STAGE_COUNT = 5;

const CORE_STATS = new Set<AffixStat>([
  "productivity",
  "machineSpeedPct",
  "materialRefundPct",
  "upgradeTierChance",
  "rarityBonus",
  "weightPhysical",
  "weightCrit",
  "weightSpeed",
  "weightLife",
  "weightDefense",
  "weightCraft",
]);

function isCoreItem(item: Item | CoreItem | null | undefined): boolean {
  return !!item && (item.kind === "core" || item.recipeId === "core");
}

function hasCoreItems(list: Item[]): boolean {
  return list.some((item) => isCoreItem(item));
}

function hasSocketedCores(state: GameState): boolean {
  const inRows = state.production.tabs.some((tab) =>
    tab.rows.some((row) => row.cores.some((core) => isCoreItem(core))),
  );
  return inRows || state.lab.cores.some((core) => isCoreItem(core));
}

/** 是否已通關第一大關（1-4）。晶化、飾品配方據此解鎖。 */
export function isZone1Cleared(state: GameState): boolean {
  return clampUnlockedStageCount(state.progress.unlockedStageCount) >= ZONE1_CLEARED_STAGE_COUNT;
}

/** 配方是否已解鎖。 */
export function isRecipeUnlocked(state: GameState, recipe: RecipeId): boolean {
  const def = PROD_RECIPES[recipe];
  if (!def) return false;
  if (def.unlock === "createTrial") return state.combat.stageId === "trial-create" || state.progress.createTrialCleared;
  if (def.unlock === "zone1") return isZone1Cleared(state);
  if (def.unlock === "core") return state.progress.coreUnlocked;
  return true;
}

function hasCoreResearch(state: GameState): boolean {
  return [...CORE_STATS].some((stat) => (state.research.points[stat] ?? 0) > 0 || (state.research.stages[stat] ?? 0) > 0);
}

export function stageIndexById(stageId: string): number {
  return STAGES.findIndex((stage) => stage.id === stageId);
}

export function clampUnlockedStageCount(count: number): number {
  const normalized = Number.isFinite(count) ? Math.floor(count) : 1;
  return Math.max(1, Math.min(STAGES.length, normalized));
}

export function highestUnlockedStageId(state: GameState): string {
  return STAGES[clampUnlockedStageCount(state.progress.unlockedStageCount) - 1]?.id ?? STAGES[0].id;
}

export function coerceUnlockedStageId(state: GameState, requestedStageId: string): string {
  if (findStage(requestedStageId)?.trial) return requestedStageId; // 試煉關直接放行
  const index = stageIndexById(requestedStageId);
  if (index >= 0 && index < clampUnlockedStageCount(state.progress.unlockedStageCount)) return requestedStageId;
  return highestUnlockedStageId(state);
}

export function unlockedStages(state: GameState) {
  return STAGES.slice(0, clampUnlockedStageCount(state.progress.unlockedStageCount));
}

export function unlockAfterStageClear(state: GameState, clearedStageId: string): void {
  const clearedIndex = stageIndexById(clearedStageId);
  if (clearedIndex < 0) return;
  state.progress.unlockedStageCount = clampUnlockedStageCount(
    Math.max(state.progress.unlockedStageCount, clearedIndex + 2),
  );
  if (clearedIndex >= CORE_UNLOCK_STAGE_INDEX) state.progress.coreUnlocked = true;
}

export function normalizeUnlockProgress(state: GameState): void {
  const currentStageIndex = Math.max(0, stageIndexById(state.combat.stageId));
  const legacyCoreUnlocked =
    hasCoreItems(state.equipmentInv)
    || hasCoreItems(state.warehouseInv)
    || hasSocketedCores(state)
    || hasCoreResearch(state)
    || currentStageIndex > CORE_UNLOCK_STAGE_INDEX
    || state.reincarnation.gameCleared;

  state.progress.unlockedStageCount = clampUnlockedStageCount(
    Math.max(
      state.progress.unlockedStageCount,
      currentStageIndex + 1,
      state.reincarnation.gameCleared ? STAGES.length : 1,
    ),
  );
  state.progress.coreUnlocked = state.progress.coreUnlocked || legacyCoreUnlocked;
}
