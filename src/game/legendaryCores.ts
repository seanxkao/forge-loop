import type { GameState } from "./types.ts";
import { createLegendaryCore } from "./coreContent.ts";

const STAGE_24_ID = "s8";
const STAGE_34_ID = "s12";

export function grantLegendaryCoreReward(state: GameState, clearedStageId: string): void {
  if (clearedStageId === STAGE_24_ID && !state.progress.grantedLegendaryCore24) {
    state.progress.grantedLegendaryCore24 = true;
    state.equipmentInv.push(createLegendaryCore(state, "・荒野"));
    return;
  }
  if (clearedStageId === STAGE_34_ID && !state.progress.grantedLegendaryCore34) {
    state.progress.grantedLegendaryCore34 = true;
    state.equipmentInv.push(createLegendaryCore(state, "・深林"));
  }
}
