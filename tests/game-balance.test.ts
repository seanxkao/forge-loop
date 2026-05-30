import test from "node:test";
import assert from "node:assert/strict";

import { HERO_BASE } from "../src/game/heroBase.ts";

test("player base flat attack is raised by five for early combat", () => {
  assert.equal(HERO_BASE.atk, 7);
});
