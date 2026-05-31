import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveLegacyItemRarity,
  rollCoreRarity,
  rollCoreVariableAffixCount,
  rollEquipmentAffixCount,
  rollEquipmentRarity,
} from "../src/game/rarity.ts";

test("equipment rarity can upgrade through magic into rare", () => {
  let call = 0;
  const rarity = rollEquipmentRarity(0, () => [0.49, 0.24][call++] ?? 0);

  assert.equal(rarity, "rare");
});

test("rarity bonus increases both equipment rarity roll thresholds", () => {
  let call = 0;
  const rarity = rollEquipmentRarity(0.1, () => [0.54, 0.26][call++] ?? 0);

  assert.equal(rarity, "rare");
});

test("equipment affix counts follow rarity buckets", () => {
  assert.equal(rollEquipmentAffixCount("normal", () => 0.99), 0);
  assert.equal(rollEquipmentAffixCount("magic", () => 0.49), 1);
  assert.equal(rollEquipmentAffixCount("magic", () => 0.5), 2);
  assert.equal(rollEquipmentAffixCount("rare", () => 0.32), 3);
  assert.equal(rollEquipmentAffixCount("rare", () => 0.34), 4);
});

test("core rarity stops at magic and core affix counts stay within one or two variable affixes", () => {
  const rarity = rollCoreRarity(0.1, () => 0.54);

  assert.equal(rarity, "magic");
  assert.equal(rollCoreVariableAffixCount("normal", () => 0.99), 0);
  assert.equal(rollCoreVariableAffixCount("magic", () => 0.49), 1);
  assert.equal(rollCoreVariableAffixCount("magic", () => 0.5), 2);
});

test("legacy items derive rarity from existing affix counts", () => {
  assert.equal(deriveLegacyItemRarity("equipment", 0), "normal");
  assert.equal(deriveLegacyItemRarity("equipment", 2), "magic");
  assert.equal(deriveLegacyItemRarity("equipment", 4), "rare");
  assert.equal(deriveLegacyItemRarity("core", 1), "normal");
  assert.equal(deriveLegacyItemRarity("core", 3), "magic");
});
