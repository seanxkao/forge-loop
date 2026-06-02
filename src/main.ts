import "./style.css";
import type { CoreSlots } from "./game/machineCores.ts";
import type { FilterEntry, GameState, ItemSlot } from "./game/types.ts";
import { organizeBag } from "./game/filter.ts";
import { MATERIALS } from "./game/content.ts";
import { load, save, wipe } from "./game/save.ts";
import { createInitialState } from "./game/state.ts";
import { GameLoop } from "./game/loop.ts";
import { tickCombat, startStage, type CombatFx } from "./game/combat.ts";
import { applyReincarnation } from "./game/reincarnation.ts";
import { coerceUnlockedStageId } from "./game/unlocks.ts";
import {
  tickProduction,
  placeMachine,
  addMachineToRow,
  removeRow,
  setRowRecipe,
  addProductionTab,
  renameProductionTab,
  removeProductionTab,
  removeMachineFromRow,
  toggleRowPaused,
  toggleRowAuto,
  enqueueOrder,
  clearOrder,
  adjustRowStep,
} from "./game/production.ts";
import { equip, unequip, toggleItemLock, toWarehouse, fromWarehouse } from "./game/equipment.ts";
import { inBattle, queueLoadoutAction, effectiveRuneSelection, cancelPendingEquip, cancelPendingVacate } from "./game/loadout.ts";
import { socketCore, unsocketCore } from "./game/machineCores.ts";
import { tickLab, toggleLabActive, researchBase } from "./game/research.ts";
import { BattleRenderer } from "./render/battle.ts";
import { UI, type CoreTarget } from "./ui/ui.ts";

let state: GameState = load();
const selectedStageId = coerceUnlockedStageId(state, state.combat.stageId);
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
  // 戰鬥隱藏時不產生任何浮動文字／攻擊特效（不繪製、也不累積）。
  onHeroAttack: (d, c) => { if (!ui.isBattleHidden()) renderer.heroAttacked(d, c); },
  onEnemyAttack: (d, blocked) => { if (!ui.isBattleHidden()) renderer.enemyAttacked(d, blocked); },
  onDrop: (mat, q) => { if (!ui.isBattleHidden()) renderer.drop(`+${q}${MATERIALS[mat]?.icon ?? ""}`); },
  onStageClear: () => ui.refresh(state),
  onHeroDied: () => ui.refresh(state), // 戰敗重來會套用待辦換裝／符文，刷新清除待套用標示
};

function coresOf(s: GameState, target: CoreTarget): CoreSlots | null {
  if (target.kind === "lab") return s.lab.cores;
  return s.production.tabs[target.tab]?.rows[target.row]?.cores ?? null;
}

function buildFilterEntry(stat: string, minTier: number): FilterEntry {
  if (stat.startsWith("__minAffixes__:")) {
    return { kind: "variableAffixes", cmp: "gte", count: Number(stat.split(":")[1] ?? "0") };
  }
  if (stat.startsWith("__minRarity__:")) {
    return { kind: "rarity", cmp: "gte", rarity: stat.split(":")[1] as never };
  }
  return { kind: "affixTier", stat: stat as Extract<FilterEntry, { kind: "affixTier" }>["stat"], cmp: "gte", tier: minTier };
}

const ui = new UI(root, canvas, {
  onSelectStage: (id) => { startStage(state, id); ui.refresh(state); },
  onToggleAutoAdvanceNext: () => { state.progress.autoAdvanceNext = !state.progress.autoAdvanceNext; ui.refresh(state); },
  onPlaceMachine: (tab, recipe) => { placeMachine(state, tab, recipe); ui.refresh(state); },
  onAddMachine: (tab, row, qty) => {
    for (let i = 0; i < qty; i += 1) {
      if (!addMachineToRow(state, tab, row)) break;
    }
    ui.refresh(state);
  },
  onRemoveMachine: (tab, row, qty) => { removeMachineFromRow(state, tab, row, qty); ui.refresh(state); },
  onToggleRowPaused: (tab, row) => { toggleRowPaused(state, tab, row); ui.refresh(state); },
  onToggleRowAuto: (tab, row) => { toggleRowAuto(state, tab, row); ui.refresh(state); },
  onEnqueueOrder: (tab, row, qty) => { enqueueOrder(state, tab, row, qty); ui.refresh(state); },
  onClearOrder: (tab, row) => { clearOrder(state, tab, row); ui.refresh(state); },
  onAdjustRowStep: (tab, row, kind, up) => { adjustRowStep(state, tab, row, kind, up); ui.refresh(state); },
  onRemoveRow: (tab, row) => { removeRow(state, tab, row); ui.refresh(state); },
  onSetRowRecipe: (tab, row, recipe) => { setRowRecipe(state, tab, row, recipe); ui.refresh(state); },
  onAddTab: () => { addProductionTab(state); ui.refresh(state); },
  onRenameTab: (tab, name) => { renameProductionTab(state, tab, name); ui.refresh(state); },
  onRemoveTab: (tab) => { removeProductionTab(state, tab); ui.refresh(state); },
  onToggleLab: () => { toggleLabActive(state); ui.refresh(state); },
  onEquip: (uid) => {
    if (inBattle(state)) {
      queueLoadoutAction(state, { kind: "equip", uid });
    } else {
      equip(state, uid);
      if (!state.progress.equippedGuideSeen && (state.equipped.weapon || state.equipped.armor || state.equipped.accessory.some(Boolean))) {
        state.progress.equippedGuideSeen = true;
      }
    }
    ui.refresh(state);
  },
  onUnequip: (slot) => {
    if (inBattle(state)) queueLoadoutAction(state, { kind: "unequip", slot });
    else unequip(state, slot);
    ui.refresh(state);
  },
  onCancelPendingEquip: (uid) => { cancelPendingEquip(state, uid); ui.refresh(state); },
  onCancelPendingVacate: (slot) => { cancelPendingVacate(state, slot); ui.refresh(state); },
  onMoveAllToWarehouse: () => { for (const eq of [...state.equipmentInv]) toWarehouse(state, eq.uid); ui.refresh(state); },
  onToggleItemLock: (uid) => { toggleItemLock(state, uid); ui.refresh(state); },
  onToWarehouse: (uid) => { toWarehouse(state, uid); ui.refresh(state); },
  onFromWarehouse: (uid) => { fromWarehouse(state, uid); ui.refresh(state); },
  onRowFilterAdd: (tab, row, stat, minTier) => {
    const target = state.production.tabs[tab]?.rows[row];
    if (target) target.filter.push(buildFilterEntry(stat, minTier));
    ui.refresh(state);
  },
  onRowFilterDel: (tab, row, index) => {
    const target = state.production.tabs[tab]?.rows[row];
    if (target) target.filter.splice(index, 1);
    ui.refresh(state);
  },
  onRowFilterUpdate: (tab, row, index, entry) => {
    const target = state.production.tabs[tab]?.rows[row];
    if (target && target.filter[index]) target.filter[index] = entry;
    ui.refresh(state);
  },
  onBagFilterAdd: (type, stat, minTier) => {
    state.bagFilters[type as ItemSlot].push(buildFilterEntry(stat, minTier));
    ui.refresh(state);
  },
  onBagFilterDel: (type, index) => {
    state.bagFilters[type as ItemSlot].splice(index, 1);
    ui.refresh(state);
  },
  onBagFilterUpdate: (type, index, entry) => {
    const list = state.bagFilters[type as ItemSlot];
    if (list && list[index]) list[index] = entry;
    ui.refresh(state);
  },
  onOrganizeBag: () => { organizeBag(state); ui.refresh(state); },
  onSocketCore: (target, uid, fromWh) => {
    const cores = coresOf(state, target);
    if (cores) socketCore(state, cores, target.slotIndex, uid, fromWh);
    ui.refresh(state);
  },
  onUnsocketCore: (target) => {
    const cores = coresOf(state, target);
    if (cores) unsocketCore(state, cores, target.slotIndex);
    ui.refresh(state);
  },
  onResearchBase: (slot) => { researchBase(state, slot); ui.refresh(state); },
  onSelectRune: (id) => {
    if (inBattle(state)) {
      const eff = effectiveRuneSelection(state);
      queueLoadoutAction(state, { kind: "rune", id: eff.id === id ? null : id });
    } else {
      state.runes.selected = state.runes.selected === id ? null : id;
    }
    ui.refresh(state);
    save(state);
  },
  onClearRune: () => {
    if (inBattle(state)) queueLoadoutAction(state, { kind: "rune", id: null });
    else state.runes.selected = null;
    ui.refresh(state);
    save(state);
  },
  onVictoryContinue: () => { state.reincarnation.victoryPending = false; ui.refresh(state); },
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
    tickLab(state, dt);
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
    if (!ui.isBattleHidden()) renderer.draw(state);
    ui.tick(state);
  },
);
loop.start();

window.addEventListener("beforeunload", () => save(state));
