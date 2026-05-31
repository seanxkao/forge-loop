import "./style.css";
import type { GameState, FilterEntry, ItemSlot } from "./game/types.ts";
import { MATERIALS } from "./game/content.ts";
import { load, save, wipe } from "./game/save.ts";
import { createInitialState } from "./game/state.ts";
import { GameLoop } from "./game/loop.ts";
import { tickCombat, startStage, type CombatFx } from "./game/combat.ts";
import { applyReincarnation } from "./game/reincarnation.ts";
import { coerceUnlockedStageId } from "./game/unlocks.ts";
import {
  tickProduction,
  craftMachine,
  toggleMachineActive,
} from "./game/production.ts";
import {
  tickCrafters,
  craftCrafter,
  craftCoreCrafter,
  toggleCrafterActive,
  toggleCoreCrafterActive,
  enqueueCraft,
  clearCraftQueue,
} from "./game/crafting.ts";
import {
  equip,
  unequip,
  discard,
  toWarehouse,
  fromWarehouse,
} from "./game/equipment.ts";
import { socketCore, unsocketCore } from "./game/machineCores.ts";
import { applyFilterSweep } from "./game/filter.ts";
import {
  tickDismantler,
  craftDismantler,
  toggleDismantlerActive,
  researchBase,
} from "./game/research.ts";
import { BattleRenderer } from "./render/battle.ts";
import { UI } from "./ui/ui.ts";

let state: GameState = load();
const selectedStageId = coerceUnlockedStageId(state, state.combat.stageId);
// 初始化 / 修復戰鬥狀態（新檔或敵人未生成）
if (selectedStageId !== state.combat.stageId) {
  startStage(state, selectedStageId);
} else if (state.combat.enemyHp <= 0 || state.combat.heroHp <= 0) {
  startStage(state, state.combat.stageId);
}

const root = document.getElementById("app")!;
const canvas = document.createElement("canvas");
canvas.id = "battle";
const renderer = new BattleRenderer(canvas);

const fx: CombatFx = {
  onHeroAttack: (d, c) => renderer.heroAttacked(d, c),
  onEnemyAttack: (d, blocked) => renderer.enemyAttacked(d, blocked),
  onDrop: (mat, q) => renderer.drop(`+${q}${MATERIALS[mat]?.icon ?? ""}`),
  onStageClear: () => ui.refresh(state),
};

const ui = new UI(root, canvas, {
  onSelectStage: (id) => {
    startStage(state, id);
    ui.refresh(state);
  },
  onCraftMachine: (id, qty) => {
    for (let i = 0; i < qty; i += 1) {
      if (!craftMachine(state, id)) break;
    }
    ui.refresh(state);
  },
  onToggleMachineActive: (id) => {
    toggleMachineActive(state, id);
    ui.refresh(state);
  },
  onCraft: (id, qty) => {
    enqueueCraft(state, id as ItemSlot, qty);
    ui.refresh(state);
  },
  onCraftCrafter: (slot, qty) => {
    for (let i = 0; i < qty; i += 1) {
      if (!craftCrafter(state, slot)) break;
    }
    ui.refresh(state);
  },
  onToggleCrafterActive: (slot) => {
    toggleCrafterActive(state, slot);
    ui.refresh(state);
  },
  onClearCraftQueue: (slot) => {
    clearCraftQueue(state, slot as ItemSlot);
    ui.refresh(state);
  },
  onEquip: (uid) => {
    equip(state, uid);
    ui.refresh(state);
  },
  onUnequip: (slot) => {
    unequip(state, slot);
    ui.refresh(state);
  },
  onDiscard: (uid) => {
    discard(state, uid);
    ui.refresh(state);
  },
  onDiscardAll: () => {
    for (const eq of [...state.equipmentInv]) discard(state, eq.uid);
    ui.refresh(state);
  },
  onDiscardAllWarehouse: () => {
    for (const eq of [...state.warehouseInv]) discard(state, eq.uid);
    ui.refresh(state);
  },
  onToWarehouse: (uid) => {
    toWarehouse(state, uid);
    ui.refresh(state);
  },
  onFromWarehouse: (uid) => {
    fromWarehouse(state, uid);
    ui.refresh(state);
  },
  onFilterAdd: (slot, stat, minTier) => {
    state.filters[slot].push({ stat: stat as FilterEntry["stat"], minTier });
    ui.refresh(state);
  },
  onFilterDel: (slot, index) => {
    state.filters[slot].splice(index, 1);
    ui.refresh(state);
  },
  onFilterSweep: () => {
    applyFilterSweep(state);
    ui.refresh(state);
  },
  onCraftDismantler: (qty) => {
    for (let i = 0; i < qty; i += 1) {
      if (!craftDismantler(state)) break;
    }
    ui.refresh(state);
  },
  onToggleDismantlerActive: () => {
    toggleDismantlerActive(state);
    ui.refresh(state);
  },
  onResearchBase: (slot) => {
    researchBase(state, slot);
    ui.refresh(state);
  },
  onCraftCoreCrafter: (qty) => {
    for (let i = 0; i < qty; i += 1) {
      if (!craftCoreCrafter(state)) break;
    }
    ui.refresh(state);
  },
  onToggleCoreCrafterActive: () => {
    toggleCoreCrafterActive(state);
    ui.refresh(state);
  },
  onSocketCore: (kind, id, slotIndex, uid, fromWarehouse) => {
    socketCore(state, { kind, id }, slotIndex, uid, fromWarehouse);
    ui.refresh(state);
  },
  onUnsocketCore: (kind, id, slotIndex) => {
    unsocketCore(state, { kind, id }, slotIndex);
    ui.refresh(state);
  },
  onVictoryContinue: () => {
    state.reincarnation.victoryPending = false;
    ui.refresh(state);
  },
  onReincarnate: (buff) => {
    state = applyReincarnation(state, createInitialState(), buff);
    startStage(state, state.combat.stageId);
    ui.refresh(state);
    save(state);
  },
  onReset: () => {
    wipe();
    state = createInitialState();
    startStage(state, state.combat.stageId);
    ui.refresh(state);
  },
});
ui.refresh(state);

let saveTimer = 0;

const loop = new GameLoop(
  (dt) => {
    const hadVictoryPending = state.reincarnation.victoryPending;
    const hadGameCleared = state.reincarnation.gameCleared;
    if (state.reincarnation.victoryPending) return;
    tickCombat(state, dt, fx);
    tickProduction(state, dt);
    tickCrafters(state, dt);
    tickDismantler(state, dt);
    if (
      state.reincarnation.victoryPending !== hadVictoryPending ||
      state.reincarnation.gameCleared !== hadGameCleared
    ) {
      ui.refresh(state);
    }
    saveTimer += dt;
    if (saveTimer >= 5) {
      saveTimer = 0;
      save(state);
    }
  },
  () => {
    renderer.draw(state);
    ui.tick(state); // 每幀只原地更新數值，不替換節點
  },
);
loop.start();

window.addEventListener("beforeunload", () => save(state));
