import test from "node:test";
import assert from "node:assert/strict";

import type { GameState } from "../src/game/types.ts";
import { totalMachinePurchaseCost } from "../src/game/machineCosts.ts";
import {
  applyReincarnation,
  materialDropMultiplier,
  powerMultiplier,
  researchStageGrowthFactor,
} from "../src/game/reincarnation.ts";

/** 最小狀態：只給 reincarnation 函式會讀的欄位（避免 import state/content 觸發 .csv）。 */
function makeState(): GameState {
  return {
    reincarnation: { cycle: 1, buffs: { research: 0, materials: 0, power: 0 }, victoryPending: false, gameCleared: false },
    runes: { owned: [], selected: [], levels: {}, unlockedStones: [], selectedStone: null },
    progress: {},
  } as unknown as GameState;
}

test("reincarnation keeps buffs and advances cycle", () => {
  const state = makeState();
  state.reincarnation.gameCleared = true;

  const next = applyReincarnation(state, makeState(), "materials");

  assert.equal(next.reincarnation.cycle, 2);
  assert.equal(next.reincarnation.buffs.materials, 1);
  assert.equal(next.reincarnation.buffs.research, 0);
  assert.equal(next.reincarnation.gameCleared, false);
  assert.equal(next.reincarnation.victoryPending, false);
});

test("reincarnation multipliers follow current formulas", () => {
  const state = makeState();
  state.reincarnation.buffs.research = 2;
  state.reincarnation.buffs.materials = 3;
  state.reincarnation.buffs.power = 4;

  // 研究成長率 = max(1.1, 2^(0.8^N))
  assert.ok(Math.abs(researchStageGrowthFactor(state) - Math.pow(2, Math.pow(0.8, 2))) < 1e-9);
  assert.ok(Math.abs(materialDropMultiplier(state) - Math.pow(1.15, 3)) < 1e-9);
  assert.ok(Math.abs(powerMultiplier(state) - Math.pow(1.1, 4)) < 1e-9);
});

test("machine costs jump with rounded 2.5x thresholds", () => {
  const total = totalMachinePurchaseCost({ ore: 5 }, 9, 3);
  assert.deepEqual(total, { ore: 30 });
});
