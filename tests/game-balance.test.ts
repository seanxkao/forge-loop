import test from "node:test";
import assert from "node:assert/strict";

import { HERO_BASE } from "../src/game/heroBase.ts";

test("player base flat attack uses the atkMin/atkMax range value", () => {
  assert.equal(HERO_BASE.atkMin, 14);
  assert.equal(HERO_BASE.atkMax, 14);
});
