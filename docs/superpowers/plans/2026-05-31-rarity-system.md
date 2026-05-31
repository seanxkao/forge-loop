# Rarity System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add item rarity generation for equipment and cores, migrate old saves, rename the core affix effect to rarity bonus, and render rarity with background colors in the UI.

**Architecture:** Introduce a shared rarity rules module in `src/game/` so equipment crafting, core crafting, and save migration all derive rarity from one source of truth. Persist rarity directly on items, then let UI rendering consume that field for labels and classes rather than inferring from affix counts.

**Tech Stack:** TypeScript, Vite, node:test, DOM UI, localStorage save migration

---

### Task 1: Add failing tests for rarity rules and save migration

**Files:**
- Create: `tests/rarity.test.ts`
- Modify: `package.json`

- [ ] Add tests for equipment rarity thresholds and affix counts
- [ ] Add tests for core rarity cap and affix counts
- [ ] Add tests for legacy save rarity derivation from affix counts
- [ ] Add the new test file to the `npm test` script
- [ ] Run the targeted test file and confirm it fails for missing behavior

### Task 2: Implement shared rarity logic and crafting integration

**Files:**
- Create: `src/game/rarity.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/crafting.ts`
- Modify: `src/game/machineCores.ts`
- Modify: `src/game/coreContent.ts`
- Modify: `src/game/affixMeta.ts`
- Modify: `src/game/equipmentView.ts`
- Modify: `src/game/unlocks.ts`

- [ ] Add item rarity types, helpers, and legacy derivation rules
- [ ] Replace direct affix-count rolls in crafting with rarity-driven affix count rolls
- [ ] Cap core rarity at magic while keeping the fixed affix behavior
- [ ] Rename the machine-core effect from extra affix chance to rarity bonus everywhere
- [ ] Change the core affix value range from `1.25%~10%` to `1%~8%`
- [ ] Run targeted tests and confirm they pass

### Task 3: Migrate save data and surface rarity in the UI

**Files:**
- Modify: `src/game/save.ts`
- Modify: `src/ui/ui.ts`
- Modify: `src/style.css`

- [ ] Backfill rarity for all saved inventory, equipped items, and socketed cores during load
- [ ] Add rarity classes to equipped items, inventory rows, warehouse rows, and core selection modal rows
- [ ] Add blue and yellow background treatments for magic and rare items
- [ ] Run the full test suite

### Task 4: Update design documentation and verify the build

**Files:**
- Modify: `DESIGN.md`

- [ ] Update the equipment generation section to describe rarity-based affix counts
- [ ] Update the core affix section to describe rarity bonus instead of extra affix count
- [ ] Run `npm.cmd run build` and confirm typecheck plus bundling succeed
