import test from "node:test";
import assert from "node:assert/strict";

import { clampTooltipPosition } from "../src/ui/tooltipPosition.ts";

test("tooltip position stays inside viewport near right and bottom edges", () => {
  const pos = clampTooltipPosition(
    { x: 790, y: 590 },
    { width: 240, height: 180 },
    { width: 800, height: 600 },
  );

  assert.deepEqual(pos, { left: 548, top: 408 });
});

test("tooltip position never goes negative near top-left corner", () => {
  const pos = clampTooltipPosition(
    { x: -20, y: -10 },
    { width: 240, height: 180 },
    { width: 800, height: 600 },
  );

  assert.deepEqual(pos, { left: 12, top: 12 });
});
