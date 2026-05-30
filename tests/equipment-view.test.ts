import test from "node:test";
import assert from "node:assert/strict";

import {
  getEquipmentComparisonRows,
  getEquipmentSummaryRows,
  getWeaponPhysicalDamage,
} from "../src/game/equipmentView.ts";
import type { Equipment, GameState } from "../src/game/types.ts";

function makeState(): GameState {
  return {
    version: 1,
    inventory: {},
    machines: {
      furnace: { count: 1, active: 1, progress: 0, idle: false },
      tannery: { count: 1, active: 1, progress: 0, idle: false },
      crystallizer: { count: 1, active: 1, progress: 0, idle: false },
    },
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
    dismantler: { count: 1, active: 1, progress: 0 },
    crafters: {
      weapon: { count: 1, active: 1, progress: 0, queue: 0, idle: false },
      armor: { count: 1, active: 1, progress: 0, queue: 0, idle: false },
      accessory: { count: 1, active: 1, progress: 0, queue: 0, idle: false },
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

function makeWeapon(
  uid: number,
  flatAtk: number,
  localPhysPct = 0,
  critChance = 0,
): Equipment {
  const affixes: Equipment["affixes"] = [];
  if (flatAtk !== 0) affixes.push({ stat: "atk", value: flatAtk, label: "點傷", tier: 3 });
  if (localPhysPct !== 0) {
    affixes.push({
      stat: "localPhysPct",
      value: localPhysPct,
      label: "本地物理",
      pct: true,
      tier: 3,
    });
  }
  if (critChance !== 0) {
    affixes.push({
      stat: "critChance",
      value: critChance,
      label: "暴擊率",
      pct: true,
      tier: 3,
    });
  }

  return {
    uid,
    recipeId: "weapon",
    name: "測試武器",
    icon: "S",
    slot: "weapon",
    base: { atk: 10 },
    affixes,
  };
}

test("weapon summary starts with computed physical damage after research bonuses", () => {
  const state = makeState();
  state.baseResearch.weapon = 1;
  state.research.stages.atk = 2;
  state.research.stages.localPhysPct = 1;

  const weapon = makeWeapon(1, 10, 0.5);
  const damage = getWeaponPhysicalDamage(state, weapon);
  const rows = getEquipmentSummaryRows(state, weapon);

  assert.equal(damage, 37.2);
  assert.equal(rows[0]?.key, "physicalDamage");
  assert.equal(rows[0]?.value, 37.2);
});

test("comparison rows include gains and losses against equipped item", () => {
  const state = makeState();
  const equipped = makeWeapon(1, 4, 0, 0.05);
  const candidate = makeWeapon(2, 8, 0.2, 0);

  const rows = getEquipmentComparisonRows(state, candidate, equipped);
  const physicalDamage = rows.find((row) => row.key === "physicalDamage");
  const critChance = rows.find((row) => row.key === "critChance");

  assert.ok(physicalDamage);
  assert.ok(Math.abs(physicalDamage.value - 21.6) < 1e-9);
  assert.ok(Math.abs((physicalDamage.delta ?? 0) - 7.6) < 1e-9);

  assert.ok(critChance);
  assert.equal(critChance.value, 0);
  assert.equal(critChance.delta, -0.05);
});
