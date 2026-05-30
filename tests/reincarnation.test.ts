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

function makeState(): GameState {
  return {
    version: 1,
    inventory: {},
    machines: {},
    equipmentInv: [],
    warehouseInv: [],
    filters: { weapon: [], armor: [], accessory: [] },
    equipped: { weapon: null, armor: null, accessory: null },
    combat: {
      stageId: "s1",
      waveIndex: 0,
      enemyIndex: 0,
      enemyHp: 0,
      heroHp: 0,
      heroAtkTimer: 0,
      enemyAtkTimer: 0,
    },
    research: { points: {}, stages: {} },
    baseResearch: { weapon: 0, armor: 0, accessory: 0 },
    baseResearchPoints: { weapon: 0, armor: 0, accessory: 0 },
    dismantler: { count: 0, active: 0, progress: 0 },
    crafters: {
      weapon: { count: 0, active: 0, progress: 0, queue: 0, idle: false },
      armor: { count: 0, active: 0, progress: 0, queue: 0, idle: false },
      accessory: { count: 0, active: 0, progress: 0, queue: 0, idle: false },
    },
    reincarnation: {
      cycle: 1,
      buffs: { research: 0, materials: 0, power: 0 },
      victoryPending: false,
      gameCleared: false,
    },
    nextEquipId: 1,
  };
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

test("reincarnation multipliers stack multiplicatively", () => {
  const state = makeState();
  state.reincarnation.buffs.research = 2;
  state.reincarnation.buffs.materials = 3;
  state.reincarnation.buffs.power = 4;

  assert.ok(Math.abs(researchStageGrowthFactor(state) - 1.28) < 1e-12);
  assert.ok(Math.abs(materialDropMultiplier(state) - 1.520875) < 1e-12);
  assert.ok(Math.abs(powerMultiplier(state) - 1.4641) < 1e-12);
});

test("machine costs jump at 10 and 100 ownership thresholds", () => {
  const total = totalMachinePurchaseCost({ ore: 5 }, 9, 3);

  assert.deepEqual(total, { ore: 55 });
});
