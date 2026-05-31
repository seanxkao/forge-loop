# Machine UI Pause Toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update all machine cards so the main action button sits on its own row, quantity buttons sit on a second row, manual `- / +` controls are removed, and a top-right pause toggle controls full-speed vs stopped operation.

**Architecture:** Keep the existing machine state shape and reuse `active` as the operational flag by mapping running to `count` and paused to `0`. Limit the code changes to UI markup/CSS plus the machine toggle handlers so the rest of the simulation loop stays intact.

**Tech Stack:** TypeScript, Vite, DOM UI, node:test

---

### Task 1: Add the pause-toggle state transition tests

**Files:**
- Create: `tests/machine-toggle.test.ts`
- Modify: `package.json`

- [ ] Add tests that toggling production, crafter, core crafter, and dismantler states switches between `0` and `count`
- [ ] Add the new test file to the test script
- [ ] Run the targeted tests and confirm they fail first

### Task 2: Implement machine toggle behavior

**Files:**
- Modify: `src/game/crafting.ts`
- Modify: `src/game/production.ts`
- Modify: `src/game/research.ts`
- Modify: `src/main.ts`

- [ ] Add toggle helpers that set `active` to `count` when resumed and `0` when paused
- [ ] Wire callbacks so all machine families use toggle instead of delta-based adjustment
- [ ] Run targeted tests and confirm they pass

### Task 3: Rebuild the machine card layout

**Files:**
- Modify: `src/ui/ui.ts`
- Modify: `src/style.css`

- [ ] Remove `- / +` controls from all machine card variants
- [ ] Add a top-right pause toggle button to production, crafter, core crafter, and dismantler cards
- [ ] Split the main action button and quantity selector buttons into separate rows
- [ ] Verify the layout in the local app

### Task 4: Run full verification

**Files:**
- Modify: `none`

- [ ] Run `npm.cmd test`
- [ ] Run `npm.cmd run build`
