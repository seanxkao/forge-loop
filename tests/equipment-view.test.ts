import test from "node:test";
import assert from "node:assert/strict";

import {
  getEquipmentComparisonRows,
  getEquipmentSummaryRows,
  getWeaponPhysicalDamage,
} from "../src/game/equipmentView.ts";
import type { Equipment, GameState } from "../src/game/types.ts";

/** 最小狀態：只給 equipment-view 函式會讀的研究欄位（避免 import content.ts 觸發 .csv）。 */
function makeState(): GameState {
  return {
    research: { points: {}, stages: {} },
    baseResearch: { weapon: 0, armor: 0, accessory: 0, core: 0 },
  } as unknown as GameState;
}

/** 測試武器：基底攻擊 10/10，可選 flatAtk（atk 詞，min=max）／物傷%／暴擊率。稀有度＝rare（吃詞綴研究）。 */
function makeWeapon(uid: number, flatAtk: number, localPhysPct = 0, critChance = 0): Equipment {
  const affixes: Equipment["affixes"] = [];
  if (flatAtk !== 0) affixes.push({ stat: "atk", value: flatAtk, valueMax: flatAtk, label: "攻擊", tier: 3, tags: ["physical"] });
  if (localPhysPct !== 0) affixes.push({ stat: "localPhysPct", value: localPhysPct, label: "武器物傷%", pct: true, tier: 3, tags: ["physical"] });
  if (critChance !== 0) affixes.push({ stat: "critChance", value: critChance, label: "暴擊率", pct: true, tier: 3, tags: ["crit"] });
  return {
    uid,
    recipeId: "weapon",
    name: "測試武器",
    icon: "S",
    kind: "equipment",
    rarity: "rare",
    locked: false,
    slot: "weapon",
    base: { atkMin: 10, atkMax: 10 },
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

  // 基底 10×1.2(基底研究) + atk詞 10×1.2(詞綴研究) = 24；×(1+物傷0.5×1.1) = 24×1.55 = 37.2
  assert.ok(Math.abs(damage.min - 37.2) < 1e-9);
  assert.ok(Math.abs(damage.max - 37.2) < 1e-9);
  assert.equal(rows[0]?.key, "physicalDamage");
  assert.ok(Math.abs((rows[0]?.value ?? 0) - 37.2) < 1e-9);
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
