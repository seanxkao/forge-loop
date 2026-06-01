import type { GameState, StatBlock, Equipment, Slot } from "../game/types.ts";
import { MATERIALS, STAGES, MACHINES, RECIPES, DISMANTLER, CRAFTERS } from "../game/content.ts";
import { CORE_MACHINE, CORE_RECIPE } from "../game/content.ts";
import type { Item } from "../game/types.ts";
import type { ItemSlot, MachineTargetKind } from "../game/types.ts";
import type { StageDef } from "../game/types.ts";
import type { ReincarnationBuff } from "../game/types.ts";
import { deriveStats, attackInterval } from "../game/hero.ts";
import { canAfford } from "../game/inventory.ts";
import { getEquipmentComparisonRows, getEquipmentSummaryRows } from "../game/equipmentView.ts";
import { totalMachinePurchaseCost } from "../game/machineCosts.ts";
import { affixLabel, isPctAffix } from "../game/affixMeta.ts";
import {
  materialDropMultiplier,
  powerMultiplier,
  researchStageGrowthFactor,
} from "../game/reincarnation.ts";
import { rarityClassName } from "../game/rarity.ts";
import { stageIndexById, unlockedStages } from "../game/unlocks.ts";
import { clampTooltipPosition } from "./tooltipPosition.ts";
import { affixBonusMultiplier, countVariableAffixes } from "../game/itemAffixes.ts";
import type { BaseResearchSlot, FilterEntry, ItemRarity } from "../game/types.ts";
import type { EquipSlotId } from "../game/types.ts";
import { findEquippedInEquipSlot } from "../game/equipmentView.ts";
import { stageCost, DISMANTLE_CYCLE, dismantleableCount, baseStageCost, baseBonus, baseItemsAvailable } from "../game/research.ts";
import { estimateFilterAverageCrafts } from "../game/filter.ts";

export interface UICallbacks {
  onSelectStage(id: string): void;
  onToggleAutoAdvanceNext(): void;
  onCraftMachine(id: string, qty: number): void;
  onToggleMachineActive(id: string): void;
  onCraft(recipeId: string, qty: number): void;
  onCraftCrafter(slot: Slot, qty: number): void;
  onToggleCrafterActive(slot: Slot): void;
  onClearCraftQueue(slot: ItemSlot): void;
  onEquip(uid: number): void;
  onUnequip(slot: EquipSlotId): void;
  onMoveAllToWarehouse(): void;
  onToggleItemLock(uid: number): void;
  onToWarehouse(uid: number): void;
  onFromWarehouse(uid: number): void;
  onFilterAdd(slot: ItemSlot, stat: string, minTier: number): void;
  onFilterDel(slot: ItemSlot, index: number): void;
  onFilterSweep(): void;
  onCraftDismantler(qty: number): void;
  onToggleDismantlerActive(): void;
  onCraftCoreCrafter(qty: number): void;
  onToggleCoreCrafterActive(): void;
  onSocketCore(kind: MachineTargetKind, id: string, slotIndex: number, uid: number, fromWarehouse: boolean): void;
  onUnsocketCore(kind: MachineTargetKind, id: string, slotIndex: number): void;
  onResearchBase(slot: BaseResearchSlot): void;
  onVictoryContinue(): void;
  onReincarnate(buff: ReincarnationBuff): void;
  onReset(): void;
}

const SLOT_NAME: Record<Slot, string> = {
  weapon: "武器",
  armor: "防具",
  accessory: "飾品",
};

const ITEM_SLOT_NAME: Record<ItemSlot, string> = {
  ...SLOT_NAME,
  core: "核心",
};

/** ??嚗澈皜?憭葡???賂?頞??芷＊蝷箏? N嚗?蝷綽??踹?憭折? DOM ?瘥???*/
const INV_RENDER_CAP = 100;

/** ?惜?湔嚗?
 *  - refresh()嚗蝙?刻?雿??遣?急????Ｘ嚗蒂敹怠???蝭暺?
 *  - tick()嚗?撟?芸??唳?唳??璅??嚗??踵?蝭暺??踹? hover ????click ?箏仃嚗?
 */
export class UI {
  private activeTab: string | null = null;
  private activeBagTab: "main" | "warehouse" = "main";
  private activeBagFilter: ItemSlot | "all" = "all";
  private activeBattleInfoTab: "stats" | "equipped" = "equipped";
  private currentState: GameState | null = null;
  private drawerEl!: HTMLElement;
  private tooltipEl!: HTMLElement;
  private filterModalEl!: HTMLElement;
  private victoryModalEl!: HTMLElement;
  private coreModalEl!: HTMLElement;
  private stageModalEl!: HTMLElement;
  private settingsModalEl!: HTMLElement;
  private stageModalOpen = false;
  private settingsModalOpen = false;
  private tooltipKey: string | null = null;
  private filterModalSlot: ItemSlot | null = null;
  private coreTarget: { kind: MachineTargetKind; id: string; slotIndex: number } | null = null;
  private panelEls: Record<string, HTMLElement> = {};
  private tabBtnEls: Record<string, HTMLElement> = {};

  private els!: {
    battleActions: HTMLElement;
    battleOptions: HTMLElement;
    battleInfoTabs: HTMLElement;
    hero: HTMLElement;
    equipped: HTMLElement;
    machines: HTMLElement;
    crafters: HTMLElement;
    crafting: HTMLElement;
    filters: HTMLElement;
    equipInv: HTMLElement;
    warehouse: HTMLElement;
    bagTabs: HTMLElement;
    inventory: HTMLElement;
    research: HTMLElement;
    reincarnation: HTMLElement;
  };

  // ?弦?? tick() ?典翰??
  private dismCountEl!: HTMLElement;
  private dismCraftBtn!: HTMLElement;
  private dismBar!: HTMLElement;
  private dismStatus!: HTMLElement;
  private researchRows: {
    stat: string;
    row: HTMLElement;
    bonus: HTMLElement;
    prog: HTMLElement;
    fill: HTMLElement;
  }[] = [];
  private baseRows: {
    slot: BaseResearchSlot;
    row: HTMLElement;
    bonus: HTMLElement;
    prog: HTMLElement;
    fill: HTMLElement;
  }[] = [];
  private researchDisp: Record<string, number> = {}; // easing ?函?憿舐內??
  private lastStages: Record<string, number> = {}; // ?菜葫??
  private flashUntil: Record<string, number> = {}; // ???唳???嚗erformance.now嚗?
  private baseResearchDisp: Record<BaseResearchSlot, number> = { weapon: 0, armor: 0, accessory: 0, core: 0 };
  private lastBaseStages: Record<BaseResearchSlot, number> = { weapon: 0, armor: 0, accessory: 0, core: 0 };
  private baseFlashUntil: Record<BaseResearchSlot, number> = { weapon: 0, armor: 0, accessory: 0, core: 0 };
  private lastCycleSeen = 1;

  // tick() ?函?敹怠?蝭暺?
  private machineCards: {
    id: string;
    countEl: HTMLElement;
    bar: HTMLElement;
    prodBar: HTMLElement | null;
    craftBtn: HTMLElement;
    cardEl: HTMLElement;
  }[] = [];
  // ???鋆質?璈??
  private crafterMachineCards: {
    slot: ItemSlot;
    countEl: HTMLElement;
    bar: HTMLElement;
    prodBar: HTMLElement | null;
    craftBtn: HTMLElement;
    cardEl: HTMLElement;
  }[] = [];
  // ????鋆質?閮??
  private orderRows: {
    slot: ItemSlot;
    queueEl: HTMLElement;
    enqueueBtns: HTMLElement[];
  }[] = [];
  private machineControlRows: { id: string; buyBtns: HTMLElement[] }[] = [];
  private crafterControlRows: { slot: ItemSlot; buyBtns: HTMLElement[] }[] = [];
  private machineBuildQty: Record<string, number> = {};
  private crafterBuildQty: Record<ItemSlot, number> = { weapon: 1, armor: 1, accessory: 1, core: 1 };
  private craftOrderQty: Record<ItemSlot, number> = { weapon: 1, armor: 1, accessory: 1, core: 1 };
  private dismantlerBuildQty = 1;
  private heroVals: Record<string, HTMLElement> = {};
  private matVals: Record<string, HTMLElement> = {};
  private matEls: Record<string, HTMLElement> = {};
  private lastWareLen = -1; // ?菜葫?澈鋡急?閫?瘨?霈?
  private lastEquipLen = -1; // ?菜葫銝餉??◤鋆質?璈?箇?霈?
  private lastTickTab: string | null = null; // ?菜葫????嚗??唳?鋆葡?府??皜

  constructor(
    private root: HTMLElement,
    private canvas: HTMLCanvasElement,
    private cb: UICallbacks,
  ) {
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="topbar">
        <h1>⚒️ Forge Loop <span class="sub">工廠迴圈 — 雛型</span></h1>
        <div class="tabrail">
          <button class="tab-btn" data-act="tab" data-arg="prod">🏭 生產</button>
          <button class="tab-btn" data-act="tab" data-arg="bag">🎒 背包</button>
          <button class="tab-btn" data-act="tab" data-arg="research">🔬 研究</button>
          <button class="tab-btn" data-act="tab" data-arg="reincarnation" data-reinc-tab hidden>♾️ 輪迴</button>
          <button class="btn-settings" data-act="openSettings">設定</button>
        </div>
      </div>
      <div class="main">
        <section class="panel main-battle">
          <div class="canvas-wrap">
            <div class="battle-actions" data-zone="battleActions"></div>
            <div class="battle-options" data-zone="battleOptions"></div>
          </div>
          <div class="battle-subtabs" data-zone="battleInfoTabs"></div>
          <div class="hero" data-zone="hero"></div>
          <div class="equipped" data-zone="equipped"></div>
        </section>
        <aside class="drawer" data-drawer>
          <section class="panel-section" data-panel="prod">
            <h2>生產</h2>
            <p class="hint">「增加機台」會花素材擴充台數；「＋／－」配置運轉台數；主按鈕右側可切換 1、10、100 批次。</p>
            <div class="machines" data-zone="machines"></div>
            <h2>製裝機</h2>
            <p class="hint">消耗中間材料產出裝備；基底效果改用提示顯示，過濾器以彈出視窗編輯。</p>
            <div class="machines" data-zone="crafters"></div>
          </section>
          <section class="panel-section" data-panel="bag">
            <div class="bag-subtabs" data-zone="bagTabs"></div>
            <div class="crafting" data-zone="crafting" hidden></div>
            <div class="filters" data-zone="filters" hidden></div>
            <h2 data-bag-equip-title>裝備庫存</h2>
            <p class="hint" data-bag-equip-hint>右鍵裝備可一鍵在主背包與倉庫間互轉。</p>
            <div class="equip-inv" data-zone="equipInv"></div>
            <h2 data-bag-warehouse-title>倉庫</h2>
            <div class="warehouse" data-zone="warehouse"></div>
          </section>
          <section class="panel-section" data-panel="research">
            <h2>研究</h2>
            <p class="hint">啟動拆解器會自動銷毀倉庫裝備；每件裝備都會推進對應類型的基底研究與固定詞綴，而 T3 以上的變動詞綴會另外轉成詞綴研究值。詞綴研究每階永久 +10%，基底研究每階永久 +20%。</p>
            <div class="research" data-zone="research"></div>
          </section>
          <section class="panel-section" data-panel="reincarnation">
            <h2>輪迴</h2>
            <p class="hint">通關後可帶走 1 個永久加成，下一輪重新開始。</p>
            <div class="reincarnation" data-zone="reincarnation"></div>
          </section>
        </aside>
      </div>
      <div class="inventory-bar">
        <div class="inventory-bar__inner">
          <span class="inventory-bar__title">素材</span>
          <div class="inventory" data-zone="inventory"></div>
        </div>
      </div>
    `;
    this.root.querySelector(".canvas-wrap")!.appendChild(this.canvas);
    this.tooltipEl = document.createElement("div");
    this.tooltipEl.className = "equip-tooltip";
    this.tooltipEl.hidden = true;
    document.body.appendChild(this.tooltipEl);
    this.filterModalEl = document.createElement("div");
    this.filterModalEl.className = "modal-backdrop";
    this.filterModalEl.hidden = true;
    document.body.appendChild(this.filterModalEl);
    this.filterModalEl.addEventListener("click", (e) => {
      if (e.target === this.filterModalEl) {
        this.filterModalSlot = null;
        this.renderFilterModal(this.currentState);
        return;
      }
      this.onClick(e as MouseEvent);
    });
    this.coreModalEl = document.createElement("div");
    this.coreModalEl.className = "modal-backdrop";
    this.coreModalEl.hidden = true;
    document.body.appendChild(this.coreModalEl);
    this.coreModalEl.addEventListener("click", (e) => {
      if (e.target === this.coreModalEl) {
        this.coreTarget = null;
        this.renderCoreModal(this.currentState);
        return;
      }
      this.onClick(e as MouseEvent);
    });
    this.victoryModalEl = document.createElement("div");
    this.victoryModalEl.className = "modal-backdrop";
    this.victoryModalEl.hidden = true;
    document.body.appendChild(this.victoryModalEl);
    this.victoryModalEl.addEventListener("click", (e) => {
      if (e.target === this.victoryModalEl) return;
      this.onClick(e as MouseEvent);
    });
    this.stageModalEl = document.createElement("div");
    this.stageModalEl.className = "modal-backdrop";
    this.stageModalEl.hidden = true;
    document.body.appendChild(this.stageModalEl);
    this.stageModalEl.addEventListener("click", (e) => {
      if (e.target === this.stageModalEl) {
        this.stageModalOpen = false;
        this.renderStageModal(this.currentState);
        return;
      }
      this.onClick(e as MouseEvent);
    });
    this.settingsModalEl = document.createElement("div");
    this.settingsModalEl.className = "modal-backdrop";
    this.settingsModalEl.hidden = true;
    document.body.appendChild(this.settingsModalEl);
    this.settingsModalEl.addEventListener("click", (e) => {
      if (e.target === this.settingsModalEl) {
        this.settingsModalOpen = false;
        this.renderSettingsModal();
        return;
      }
      this.onClick(e as MouseEvent);
    });
    const z = (n: string) =>
      this.root.querySelector(`[data-zone="${n}"]`) as HTMLElement;
    this.els = {
      battleActions: z("battleActions"),
      battleOptions: z("battleOptions"),
      battleInfoTabs: z("battleInfoTabs"),
      hero: z("hero"),
      equipped: z("equipped"),
      machines: z("machines"),
      crafters: z("crafters"),
      crafting: z("crafting"),
      filters: z("filters"),
      equipInv: z("equipInv"),
      warehouse: z("warehouse"),
      bagTabs: z("bagTabs"),
      inventory: z("inventory"),
      research: z("research"),
      reincarnation: z("reincarnation"),
    };
    // ?賢??????
    this.drawerEl = this.root.querySelector("[data-drawer]") as HTMLElement;
    this.panelEls = {};
    this.root
      .querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((el) => (this.panelEls[el.dataset.panel!] = el));
    this.tabBtnEls = {};
    this.root
      .querySelectorAll<HTMLElement>(".tab-btn")
      .forEach((el) => (this.tabBtnEls[el.dataset.arg!] = el));
    // 蝯????偶銝?撱箇??Ｘ?芸遣銝甈?
    this.buildHero();
    this.buildInventory();
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    this.root.addEventListener("mousemove", (e) => this.onHoverMove(e));
    this.root.addEventListener("mouseleave", () => this.hideTooltip());
  }

  /** ???游??撅????????嗉絲??*/
  private setTab(tab: string): void {
    this.activeTab = this.activeTab === tab ? null : tab;
    this.drawerEl.classList.toggle("open", this.activeTab !== null);
    for (const k in this.panelEls) {
      this.panelEls[k].classList.toggle("active", k === this.activeTab);
    }
    for (const k in this.tabBtnEls) {
      this.tabBtnEls[k].classList.toggle("sel", k === this.activeTab);
    }
  }

  /** ?喲鋆?嚗??萄銝餉????澈??頧?*/
  private onContextMenu(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest("[data-uid]") as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    const uid = Number(t.dataset.uid);
    if (t.dataset.bag === "ware") this.cb.onFromWarehouse(uid);
    else this.cb.onToWarehouse(uid);
  }

  private onHoverMove(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest("[data-eqtip]") as HTMLElement | null;
    if (!target || !this.currentState) {
      this.hideTooltip();
      return;
    }
    const eq = this.resolveTooltipEquipment(target, this.currentState);
    if (!eq) {
      this.hideTooltip();
      return;
    }
    const key = target.dataset.eqtip ?? "";
    if (key !== this.tooltipKey) {
      this.tooltipKey = key;
      this.renderTooltip(eq, this.currentState);
    }
    this.positionTooltip(e.clientX, e.clientY);
  }

  private resolveTooltipEquipment(target: HTMLElement, state: GameState): Item | null {
    const coreUid = Number(target.dataset.coreUid);
    if (Number.isFinite(coreUid)) {
      return findItemByUid(state, coreUid);
    }

    const slot = target.dataset.eqslot as EquipSlotId | undefined;
    if (slot) return findEquippedInEquipSlot(state, slot);

    const uid = Number(target.dataset.uid);
    if (!Number.isFinite(uid)) return null;
    if (target.dataset.bag === "ware") {
      return state.warehouseInv.find((eq) => eq.uid === uid) ?? null;
    }
    return state.equipmentInv.find((eq) => eq.uid === uid) ?? null;
  }

  private renderTooltip(eq: Item, state: GameState): void {
    const equipped = eq.kind === "equipment"
      ? eq.slot === "accessory"
        ? state.equipped.accessory.find((item) => item?.uid === eq.uid) ?? state.equipped.accessory[0]
        : state.equipped[eq.slot]
      : null;
    const compareTarget = equipped?.uid === eq.uid ? null : equipped;
    const rows = getEquipmentComparisonRows(state, eq, compareTarget);
    this.tooltipEl.innerHTML = `
      <div class="equip-tooltip__title">${eq.icon} ${eq.name}</div>
      <div class="equip-tooltip__subtitle">${
        compareTarget ? `對比目前裝備：${compareTarget.icon} ${compareTarget.name}` : "目前裝備"
      }</div>
      <div class="equip-tooltip__rows">
        ${rows.map((row) => renderTooltipRow(row)).join("")}
      </div>
      <div class="equip-tooltip__detail">${describeEquip(eq, state)}</div>
    `;
    this.tooltipEl.hidden = false;
  }

  private positionTooltip(x: number, y: number): void {
    const { width, height } = this.tooltipEl.getBoundingClientRect();
    const pos = clampTooltipPosition(
      { x, y },
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    this.tooltipEl.style.left = `${pos.left}px`;
    this.tooltipEl.style.top = `${pos.top}px`;
  }

  private hideTooltip(): void {
    this.tooltipKey = null;
    this.tooltipEl.hidden = true;
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.act!;
    const arg = t.dataset.arg ?? "";
    switch (act) {
      case "reset":
        if (confirm("確定要重置存檔嗎？所有進度（裝備、材料、研究、關卡）將永久清除且無法復原。")) {
          this.settingsModalOpen = false;
          this.renderSettingsModal();
          this.cb.onReset();
        }
        break;
      case "openSettings":
        this.settingsModalOpen = true;
        this.renderSettingsModal();
        break;
      case "closeSettings":
        this.settingsModalOpen = false;
        this.renderSettingsModal();
        break;
      case "tab":
        this.setTab(arg);
        break;
      case "stage":
        this.stageModalOpen = false;
        this.renderStageModal(this.currentState);
        this.cb.onSelectStage(arg);
        break;
      case "openStageMap":
        this.stageModalOpen = true;
        this.renderStageModal(this.currentState);
        break;
      case "closeStageMap":
        this.stageModalOpen = false;
        this.renderStageModal(this.currentState);
        break;
      case "toggleAutoNext":
        this.cb.onToggleAutoAdvanceNext();
        break;
      case "craftMachine":
        this.cb.onCraftMachine(arg, Number(t.dataset.qty ?? "1"));
        break;
      case "toggleMachine":
        this.cb.onToggleMachineActive(arg);
        break;
      case "craft":
        this.cb.onCraft(arg, Number(t.dataset.qty ?? "1"));
        break;
      case "toggleCrafter":
        this.cb.onToggleCrafterActive(arg as Slot);
        break;
      case "craftCrafter":
        this.cb.onCraftCrafter(arg as Slot, Number(t.dataset.qty ?? "1"));
        break;
      case "clearQueue":
        this.cb.onClearCraftQueue(arg as Slot);
        break;
      case "equip":
        this.cb.onEquip(Number(arg));
        break;
      case "unequip":
        this.cb.onUnequip(arg as EquipSlotId);
        break;
      case "moveAllToWarehouse":
        this.cb.onMoveAllToWarehouse();
        break;
      case "toggleLock":
        this.cb.onToggleItemLock(Number(arg));
        break;
      case "toWare":
        this.cb.onToWarehouse(Number(arg));
        break;
      case "fromWare":
        this.cb.onFromWarehouse(Number(arg));
        break;
      case "bagTab":
        this.activeBagTab = arg === "warehouse" ? "warehouse" : "main";
        if (this.currentState) {
          this.renderBagTabs();
          this.renderEquipInv(this.currentState);
          this.renderWarehouse(this.currentState);
        }
        break;
      case "bagFilter":
        this.activeBagFilter = arg === "all" ? "all" : arg as ItemSlot;
        if (this.currentState) {
          this.renderBagTabs();
          this.renderEquipInv(this.currentState);
          this.renderWarehouse(this.currentState);
        }
        break;
      case "battleInfoTab":
        this.activeBattleInfoTab = arg === "equipped" ? "equipped" : "stats";
        if (this.currentState) {
          this.renderBattleInfoTabs();
          this.renderHeroPanel();
          this.renderEquipped(this.currentState);
        }
        break;
      case "selectMachineQty":
        this.machineBuildQty[arg] = Number(t.dataset.qty ?? "1");
        if (this.currentState) this.renderMachines(this.currentState);
        break;
      case "selectCrafterBuildQty":
        this.crafterBuildQty[arg as Slot] = Number(t.dataset.qty ?? "1");
        if (this.currentState) this.renderCrafterMachines(this.currentState);
        break;
      case "selectCraftQty":
        this.craftOrderQty[arg as Slot] = Number(t.dataset.qty ?? "1");
        if (this.currentState) this.renderCrafterMachines(this.currentState);
        break;
      case "selectDismQty":
        this.dismantlerBuildQty = Number(t.dataset.qty ?? "1");
        if (this.currentState) this.renderResearch();
        if (this.currentState) this.tick(this.currentState);
        break;
      case "openFilter":
        this.filterModalSlot = arg as ItemSlot;
        if (this.currentState) this.renderFilterModal(this.currentState);
        break;
      case "closeFilter":
        this.filterModalSlot = null;
        this.renderFilterModal(this.currentState);
        break;
      case "filterAdd": {
        const stat = (
          this.filterModalEl.querySelector(
            `[data-fstat="${arg}"]`,
          ) as HTMLSelectElement
        ).value;
        const tier = Number(
          (
            this.filterModalEl.querySelector(
              `[data-ftier="${arg}"]`,
            ) as HTMLSelectElement
          ).value,
        );
        this.cb.onFilterAdd(arg as ItemSlot, stat, tier);
        break;
      }
      case "filterAddQuick": {
        const value = t.dataset.value ?? "";
        this.cb.onFilterAdd(arg as ItemSlot, value, 0);
        break;
      }
      case "filterDel": {
        const [slot, idx] = arg.split(":");
        this.cb.onFilterDel(slot as ItemSlot, Number(idx));
        break;
      }
      case "openCore":
        this.coreTarget = {
          kind: t.dataset.kind as MachineTargetKind,
          id: t.dataset.targetId ?? "",
          slotIndex: Number(t.dataset.slotIndex ?? "0"),
        };
        this.renderCoreModal(this.currentState);
        break;
      case "closeCore":
        this.coreTarget = null;
        this.renderCoreModal(this.currentState);
        break;
      case "socketCoreInv":
        if (this.coreTarget) this.cb.onSocketCore(this.coreTarget.kind, this.coreTarget.id, this.coreTarget.slotIndex, Number(arg), false);
        this.coreTarget = null;
        this.renderCoreModal(this.currentState);
        break;
      case "socketCoreWare":
        if (this.coreTarget) this.cb.onSocketCore(this.coreTarget.kind, this.coreTarget.id, this.coreTarget.slotIndex, Number(arg), true);
        this.coreTarget = null;
        this.renderCoreModal(this.currentState);
        break;
      case "unsocketCore":
        this.cb.onUnsocketCore(
          t.dataset.kind as MachineTargetKind,
          t.dataset.targetId ?? "",
          Number(t.dataset.slotIndex ?? "0"),
        );
        break;
      case "filterSweep":
        this.cb.onFilterSweep();
        break;
      case "craftDismantler":
        this.cb.onCraftDismantler(Number(t.dataset.qty ?? "1"));
        break;
      case "toggleDism":
        this.cb.onToggleDismantlerActive();
        break;
      case "craftCoreCrafter":
        this.cb.onCraftCoreCrafter(Number(t.dataset.qty ?? "1"));
        break;
      case "toggleCoreCrafter":
        this.cb.onToggleCoreCrafterActive();
        break;
      case "researchBase":
        this.cb.onResearchBase(arg as BaseResearchSlot);
        break;
      case "victoryContinue":
        this.cb.onVictoryContinue();
        break;
      case "reincarnate":
        this.cb.onReincarnate(arg as ReincarnationBuff);
        break;
    }
  }

  /** 雿輻??雿??澆嚗?撱箏????踴??啣翰??銝西?銝甈?live ?湔??*/
  refresh(state: GameState): void {
    if (state.reincarnation.cycle !== this.lastCycleSeen) {
      this.resetResearchAnimationCaches();
      this.lastCycleSeen = state.reincarnation.cycle;
    }
    this.currentState = state;
    this.renderStages(state);
    this.renderBattleActions(state);
    this.renderEquipped(state);
    this.renderMachines(state);
    this.renderCrafterMachines(state);
    this.renderBagTabs();
    this.renderEquipInv(state);
    this.renderWarehouse(state);
    this.renderResearch();
    this.renderReincarnation(state);
    this.renderStageModal(state);
    this.renderFilterModal(state);
    this.renderSettingsModal();
    this.renderCoreModal(state);
    this.renderVictoryModal(state);
    const reincTab = this.root.querySelector<HTMLElement>("[data-reinc-tab]");
    if (reincTab) reincTab.hidden = !state.reincarnation.gameCleared && state.reincarnation.cycle <= 1;
    if (this.activeTab === "reincarnation" && !state.reincarnation.gameCleared && state.reincarnation.cycle <= 1) {
      this.setTab("prod");
    }
    this.tick(state);
  }

  private resetResearchAnimationCaches(): void {
    this.researchDisp = {};
    this.lastStages = {};
    this.flashUntil = {};
    this.baseResearchDisp = { weapon: 0, armor: 0, accessory: 0, core: 0 };
    this.lastBaseStages = { weapon: 0, armor: 0, accessory: 0, core: 0 };
    this.baseFlashUntil = { weapon: 0, armor: 0, accessory: 0, core: 0 };
  }

  /** 瘥??澆嚗??湔?詨潸?璅??嚗??踵?隞颱?蝭暺?*/
  tick(state: GameState): void {
    this.currentState = state;
    const s = deriveStats(state);
    // ?梢?撅祆?
    const setHV = (k: string, v: string) => {
      const el = this.heroVals[k];
      if (el) el.textContent = v;
    };
    setHV("hp", `${Math.ceil(Math.max(0, state.combat.heroHp))} / ${Math.round(s.hp)}`);
    setHV("atk", `${Math.round(s.atk)}`);
    setHV("def", `${Math.round(s.def)}`);
    setHV("spd", `${attackInterval(s).toFixed(2)}s`);
    setHV("crit", `${Math.round(s.critChance * 100)}%`);
    setHV("critm", `${Math.round(s.critMult * 100)}%`);
    setHV("regen", `${Math.round(s.hpRegen)}/s`);
    setHV("dr", `${Math.round(s.dmgReductionPct * 100)}%`);
    setHV("block", `${Math.round(s.blockChance * 100)}%`);

    // 蝝??賊?
    for (const id in this.matVals) {
      const n = state.inventory[id] ?? 0;
      this.matVals[id].textContent = `${n}`;
      this.matEls[id].classList.toggle("dim", n === 0);
    }

    // 璈?∠?嚗?頧?蝮賣?脣漲璇撩?ˊ???眺敺絲?
    for (const c of this.machineCards) {
      const def = MACHINES[c.id];
      const st = state.machines[c.id];
      const active = st?.active ?? 0;
      const qty = this.machineBuildQty[c.id] ?? 1;
      c.countEl.textContent = `${active}/${st?.count ?? 0}`;
      c.bar.style.width =
        st && active > 0 ? `${Math.round((st.progress / def.cycleTime) * 100)}%` : "0%";
      if (c.prodBar) c.prodBar.style.width = `${Math.round(((st?.productivity ?? 0) % 1) * 100)}%`;
      c.cardEl.classList.toggle("idle", !!st?.idle);
      c.craftBtn.classList.toggle("poor", !canAfford(state, totalMachinePurchaseCost(def.buildCost, st?.count ?? 0, qty)));
    }
    for (const row of this.machineControlRows) {
      const count = state.machines[row.id]?.count ?? 0;
      const qty = this.machineBuildQty[row.id] ?? 1;
      const poor = !canAfford(state, totalMachinePurchaseCost(MACHINES[row.id].buildCost, count, qty));
      for (const btn of row.buyBtns) btn.classList.toggle("poor", poor);
    }
    // ??ˊ鋆??∠?嚗?頧?蝮賣?脣漲璇撩??璅遣???眺敺絲?
    for (const c of this.crafterMachineCards) {
      const cr = c.slot === "core" ? CORE_MACHINE : CRAFTERS[c.slot];
      const st = c.slot === "core" ? state.coreCrafter : state.crafters[c.slot];
      const active = st?.active ?? 0;
      const qty = this.crafterBuildQty[c.slot] ?? 1;
      c.countEl.textContent = `${active}/${st?.count ?? 0}`;
      c.bar.style.width =
        st && active > 0
          ? `${Math.round((st.progress / (c.slot === "core" ? CORE_MACHINE.cycleTime : cr.cycleTime)) * 100)}%`
          : "0%";
      if (c.prodBar) c.prodBar.style.width = `${Math.round(((st?.productivity ?? 0) % 1) * 100)}%`;
      c.cardEl.classList.toggle("idle", !!st?.idle);
      c.craftBtn.classList.toggle(
        "poor",
        !canAfford(
          state,
          totalMachinePurchaseCost(c.slot === "core" ? CORE_MACHINE.buildCost : cr.buildCost, st?.count ?? 0, qty),
        ),
      );
    }
    for (const row of this.crafterControlRows) {
      const count = row.slot === "core" ? state.coreCrafter.count : state.crafters[row.slot]?.count ?? 0;
      const qty = this.crafterBuildQty[row.slot] ?? 1;
      const poor = !canAfford(
        state,
        totalMachinePurchaseCost(row.slot === "core" ? CORE_MACHINE.buildCost : CRAFTERS[row.slot].buildCost, count, qty),
      );
      for (const btn of row.buyBtns) btn.classList.toggle("poor", poor);
    }
    // ???ˊ鋆??桀?嚗??????眺敺絲?
    for (const o of this.orderRows) {
      const st = o.slot === "core" ? state.coreCrafter : state.crafters[o.slot];
      o.queueEl.textContent = `${st?.queue ?? 0}`;
      const poorMat = !canAfford(
        state,
        scaleCost(o.slot === "core" ? CORE_RECIPE.cost : RECIPES[o.slot].cost, this.craftOrderQty[o.slot] ?? 1),
      );
      for (const b of o.enqueueBtns) b.classList.toggle("poor", poorMat);
    }

    // ?弦??嚗?閫?? / ?弦頠?/ ?箏??弦? O(N) ????貉??箏?隞嗆??嚗?
    // ??函?蝛嗅???????堆??園???甇日?輸?????賢極嚗?
    const now = performance.now();
    if (this.activeTab === "research") {
    const dm = state.dismantler;
    this.dismCountEl.textContent = `${dm.active}/${dm.count}`;
    this.dismBar.style.width =
      dm.active > 0 ? `${Math.round((dm.progress / DISMANTLE_CYCLE) * 100)}%` : "0%";
    this.dismCraftBtn.classList.toggle(
      "poor",
      !canAfford(state, totalMachinePurchaseCost(DISMANTLER.buildCost, dm.count, this.dismantlerBuildQty)),
    );
    const dcount = dismantleableCount(state);
    this.dismStatus.textContent = dcount
      ? `可拆 ${dcount} 件裝備`
      : "倉庫裡沒有可拆裝備";
    for (const t of this.researchRows) {
      const stages = state.research.stages[t.stat] ?? 0;
      const pts = state.research.points[t.stat] ?? 0;
      const cost = stageCost(state, stages);
      if (this.lastStages[t.stat] === undefined) this.lastStages[t.stat] = stages;
      // ??嚗??脣漲璇?皛踴孛?潮?????ease ??唳???
      if (stages !== this.lastStages[t.stat]) {
        this.researchDisp[t.stat] = stageCost(state, this.lastStages[t.stat]);
        this.lastStages[t.stat] = stages;
        this.flashUntil[t.stat] = now + 700;
      }
      const prev = this.researchDisp[t.stat] ?? pts;
      const disp = prev + (pts - prev) * 0.18; // easing
      this.researchDisp[t.stat] = disp;
      t.bonus.textContent = `+${stages * 10}%`;
      t.prog.textContent = `${Math.floor(disp)}/${cost}`;
      t.fill.style.width = `${Math.round(Math.min(1, disp / cost) * 100)}%`;
      t.row.classList.toggle("flash", (this.flashUntil[t.stat] ?? 0) > now);
    }
    // ?箏??弦嚗????瘨???隞嗆?????
    for (const b of this.baseRows) {
      const stages = state.baseResearch[b.slot] ?? 0;
      const need = baseStageCost(state, stages);
      const avail = baseItemsAvailable(state, b.slot);
      if (this.lastBaseStages[b.slot] === undefined) this.lastBaseStages[b.slot] = stages;
      if (stages !== this.lastBaseStages[b.slot]) {
        this.baseResearchDisp[b.slot] = baseStageCost(state, this.lastBaseStages[b.slot]);
        this.lastBaseStages[b.slot] = stages;
        this.baseFlashUntil[b.slot] = now + 700;
      }
      const prev = this.baseResearchDisp[b.slot] ?? avail;
      const disp = prev + (avail - prev) * 0.18;
      this.baseResearchDisp[b.slot] = disp;
      b.bonus.textContent = `+${Math.round(baseBonus(state, b.slot) * 100)}%`;
      b.prog.textContent = `${Math.floor(disp)}/${need}`;
      b.fill.style.width = `${Math.round(Math.min(1, disp / need) * 100)}%`;
      b.row.classList.toggle("flash", (this.baseFlashUntil[b.slot] ?? 0) > now);
    }
    } // end research ??

    // ????嚗??桀?賢?憭改?撠文?澈嚗???刻府???????冽????撱綽?
    // ???啗?????銋?皜脫?銝甈∴??踹??典????霈?瘝???
    const tabSwitched = this.activeTab !== this.lastTickTab;
    this.lastTickTab = this.activeTab;
    if (this.activeTab === "bag") {
      if (tabSwitched || state.equipmentInv.length !== this.lastEquipLen) {
        this.renderEquipInv(state);
      }
      if (tabSwitched || state.warehouseInv.length !== this.lastWareLen) {
        this.renderWarehouse(state);
      }
    }
  }

  // ---- ?芸遣銝甈∠????Ｘ ----

  private buildHero(): void {
    this.renderBattleInfoTabs();
    this.els.hero.innerHTML = `
      <div class="stat-grid">
        <span>生命</span><b data-hv="hp"></b>
        <span>點傷</span><b data-hv="atk"></b>
        <span>防禦</span><b data-hv="def"></b>
        <span>攻速</span><b data-hv="spd"></b>
        <span>暴擊</span><b data-hv="crit"></b>
        <span>暴傷</span><b data-hv="critm"></b>
        <span>回血</span><b data-hv="regen"></b>
        <span>減傷</span><b data-hv="dr"></b>
        <span>格檔率</span><b data-hv="block"></b>
      </div>`;
    this.heroVals = {};
    this.els.hero.querySelectorAll<HTMLElement>("[data-hv]").forEach((el) => {
      this.heroVals[el.dataset.hv!] = el;
    });
    this.renderHeroPanel();
  }

  private renderBattleInfoTabs(): void {
    this.els.battleInfoTabs.innerHTML = `
      <div class="battle-subtab-row">
        <button class="tab-btn${this.activeBattleInfoTab === "equipped" ? " sel" : ""}" data-act="battleInfoTab" data-arg="equipped">裝備</button>
        <button class="tab-btn${this.activeBattleInfoTab === "stats" ? " sel" : ""}" data-act="battleInfoTab" data-arg="stats">角色數據</button>
      </div>
    `;
  }

  private renderHeroPanel(): void {
    const showStats = this.activeBattleInfoTab === "stats";
    this.els.hero.hidden = !showStats;
    this.els.hero.style.display = showStats ? "" : "none";
    this.els.equipped.hidden = showStats;
    this.els.equipped.style.display = showStats ? "none" : "flex";
  }

  private buildInventory(): void {
    this.els.inventory.innerHTML = Object.values(MATERIALS)
      .map(
        (m) => `<span class="mat" data-mat="${m.id}" title="${m.name}">${m.icon} ${m.name} <b data-mc="${m.id}">0</b></span>`,
      )
      .join("");
    this.matVals = {};
    this.matEls = {};
    this.els.inventory.querySelectorAll<HTMLElement>(".mat").forEach((el) => {
      const id = el.dataset.mat!;
      this.matEls[id] = el;
      this.matVals[id] = el.querySelector<HTMLElement>("[data-mc]")!;
    });
  }

  // ---- ??敺??遣???----

  private renderStages(state: GameState): string {
    return unlockedStages(state).map((s) => {
      const cur = s.id === state.combat.stageId ? " sel" : "";
      const enemies = summarizeStageEnemies(s);
      const drops = summarizeStageDrops(s);
      return `<button class="stage-btn${cur}" data-act="stage" data-arg="${s.id}"
        title="${s.desc}">
        <span class="stage-btn__name">${s.name}</span>
        <span class="stage-btn__desc">${enemies}</span>
        <span class="stage-btn__drops">${drops}</span>
      </button>`;
    }).join("");
  }

  private renderBattleActions(state: GameState): void {
    const currentIndex = stageIndexById(state.combat.stageId);
    const nextIndex = currentIndex + 1;
    const canAdvance =
      currentIndex >= 0 &&
      nextIndex < STAGES.length &&
      nextIndex < state.progress.unlockedStageCount;
    this.els.battleActions.innerHTML = canAdvance
      ? `<button class="battle-next-btn" data-act="openStageMap">地圖</button>
         <button class="battle-next-btn" data-act="stage" data-arg="${STAGES[nextIndex].id}">前往下一關</button>`
      : `<button class="battle-next-btn" data-act="openStageMap">地圖</button>`;
    this.els.battleOptions.innerHTML = `
      <label class="battle-check">
        <input type="checkbox" data-act="toggleAutoNext" ${state.progress.autoAdvanceNext ? "checked" : ""}>
        <span>自動前往下一關</span>
      </label>
    `;
  }

  private renderStageModal(state: GameState | null): void {
    if (!state || !this.stageModalOpen) {
      this.stageModalEl.hidden = true;
      this.stageModalEl.innerHTML = "";
      return;
    }
    this.stageModalEl.innerHTML = `
      <div class="modal-card modal-card--stage" role="dialog" aria-modal="true" aria-label="地圖選關">
        <div class="modal-head">
          <h3>地圖選關</h3>
          <button class="modal-close" data-act="closeStageMap">關閉</button>
        </div>
        <div class="stages">${this.renderStages(state)}</div>
      </div>
    `;
    this.stageModalEl.hidden = false;
  }

  private renderSettingsModal(): void {
    if (!this.settingsModalOpen) {
      this.settingsModalEl.hidden = true;
      this.settingsModalEl.innerHTML = "";
      return;
    }
    this.settingsModalEl.innerHTML = `
      <div class="modal-card modal-card--settings" role="dialog" aria-modal="true" aria-label="設定">
        <div class="modal-head">
          <h3>設定</h3>
          <button class="modal-close" data-act="closeSettings">關閉</button>
        </div>
        <div class="settings-list">
          <button class="btn-reset" data-act="reset">刪除存檔</button>
        </div>
      </div>
    `;
    this.settingsModalEl.hidden = false;
  }

  private renderEquipped(state: GameState): void {
    this.renderHeroPanel();
    const slots: Array<{ id: EquipSlotId; label: string; eq: Equipment | null }> = [
      { id: "weapon", label: SLOT_NAME.weapon, eq: state.equipped.weapon },
      { id: "armor", label: SLOT_NAME.armor, eq: state.equipped.armor },
      { id: "accessory1", label: "飾品 1", eq: state.equipped.accessory[0] },
      { id: "accessory2", label: "飾品 2", eq: state.equipped.accessory[1] },
    ];
    this.els.equipped.innerHTML = slots
      .map(({ id, label, eq }) => {
        if (!eq) return `<div class="eq-slot empty"><span class="slot-tag">${label}</span>未裝備</div>`;
        return `<div class="eq-slot ${rarityClassName(eq.rarity)}" data-eqtip="eq:${id}" data-eqslot="${id}"><span class="slot-tag">${label}</span>
          <span class="eq-name">${eq.icon} ${eq.name}</span>
          <span class="eq-stats">${describeEquip(eq, state)}</span>
          <button data-act="unequip" data-arg="${id}">卸下</button></div>`;
      })
      .join("");
  }

  private renderMachines(state: GameState): void {
    this.els.machines.innerHTML = Object.values(MACHINES)
      .map((m) => {
        const st = state.machines[m.id];
        const active = st?.active ?? 0;
        const total = st?.count ?? 0;
        const qty = this.machineBuildQty[m.id] ?? 1;
        const buildCost = totalMachinePurchaseCost(m.buildCost, total, qty);
        return `<div class="machine-card" data-mid="${m.id}">
          <div class="mc-top">
            <div class="mc-title">
              <span class="mb-icon">${m.icon}</span>
              <span class="mb-name">${m.name} <span class="mb-own" data-mcount>${active}/${total}</span></span>
            </div>
            <button class="mc-toggle${active > 0 ? "" : " paused"}" data-act="toggleMachine" data-arg="${m.id}">${active > 0 ? "運轉中" : "已暫停"}</button>
          </div>
          <span class="mb-recipe">${cost(m.input)} → ${cost(m.output)} / ${m.cycleTime}s</span>
          <span class="cell-bar mc-bar"><i data-mbar></i></span>
          <span class="cell-bar mc-bar mc-bar--productivity"><i data-mpbar></i></span>
          ${this.renderCoreSlots("machine", m.id, st?.cores ?? [null, null])}
          <div class="mc-btns mc-btns--primary">
            <button class="mc-main-btn" data-act="craftMachine" data-arg="${m.id}" data-qty="${qty}">增加機台 ${qty}（${cost(buildCost)}）</button>
          </div>
          <div class="mc-btns mc-btns--qty">
            ${renderQtyButtons("selectMachineQty", m.id, qty, "mc-mini-btn", [1, 10, 100, 1000, 10000])}
          </div>
        </div>`;
      })
      .join("");
    this.machineCards = [];
    this.machineControlRows = [];
    this.els.machines
      .querySelectorAll<HTMLElement>("[data-mid]")
      .forEach((card) => {
        this.machineCards.push({
          id: card.dataset.mid!,
          countEl: card.querySelector<HTMLElement>("[data-mcount]")!,
          bar: card.querySelector<HTMLElement>("[data-mbar]")!,
          prodBar: card.querySelector<HTMLElement>("[data-mpbar]"),
          craftBtn: card.querySelector<HTMLElement>(".mc-main-btn")!,
          cardEl: card,
        });
        this.machineControlRows.push({
          id: card.dataset.mid!,
          buyBtns: Array.from(card.querySelectorAll<HTMLElement>("[data-act=\"craftMachine\"]")),
        });
      });
  }

  /** ???鋆質?璈??瘥?璈嚗ˊ??嚗?嚗脣漲嚗?*/
  private renderCrafterMachines(state: GameState): void {
    const slots: Slot[] = ["weapon", "armor", "accessory"];
    this.els.crafters.innerHTML = slots
      .map((slot) => {
        const r = RECIPES[slot];
        const cr = CRAFTERS[slot];
        const c = state.crafters[slot];
        const active = c?.active ?? 0;
        const total = c?.count ?? 0;
        const buildQty = this.crafterBuildQty[slot] ?? 1;
        const buildCost = totalMachinePurchaseCost(cr.buildCost, total, buildQty);
        return `<div class="machine-card crafter-card" data-cmid="${slot}">
          <div class="mc-top">
            <div class="mc-title">
              <span class="mb-icon">${r.icon}</span>
              <span class="mb-name">${r.name} <span class="mb-own" data-ccount>${active}/${total}</span></span>
            </div>
            <button class="mc-toggle${active > 0 ? "" : " paused"}" data-act="toggleCrafter" data-arg="${slot}">${active > 0 ? "運轉中" : "已暫停"}</button>
          </div>
          <span class="mb-recipe">${cost(r.cost)} → 裝備 / ${cr.cycleTime}s</span>
          <span class="cell-bar mc-bar"><i data-cbar></i></span>
          <span class="cell-bar mc-bar mc-bar--productivity"><i data-cpbar></i></span>
          ${this.renderCoreSlots("crafter", slot, c?.cores ?? [null, null])}
          ${this.renderCrafterOrder(slot, state)}
          <div class="mc-btns mc-btns--primary">
            <button class="mc-main-btn" data-act="craftCrafter" data-arg="${slot}" data-qty="${buildQty}">增加機台 ${buildQty}（${cost(buildCost)}）</button>
          </div>
          <div class="mc-btns mc-btns--qty">
            ${renderQtyButtons("selectCrafterBuildQty", slot, buildQty, "mc-mini-btn", [1, 10, 100, 1000, 10000])}
          </div>
          <div class="mc-btns mc-btns--secondary">
            <button class="mc-mini-btn" data-act="openFilter" data-arg="${slot}">過濾器</button>
          </div>
        </div>`;
      })
      .join("") + (state.progress.coreUnlocked ? this.renderCoreCrafterMachine(state) : "");
    this.crafterMachineCards = [];
    this.crafterControlRows = [];
    this.els.crafters.querySelectorAll<HTMLElement>("[data-cmid]").forEach((card) => {
      this.crafterMachineCards.push({
        slot: card.dataset.cmid as ItemSlot,
        countEl: card.querySelector<HTMLElement>("[data-ccount]")!,
        bar: card.querySelector<HTMLElement>("[data-cbar]")!,
        prodBar: card.querySelector<HTMLElement>("[data-cpbar], [data-corepbar]"),
        craftBtn: card.querySelector<HTMLElement>(".mc-main-btn")!,
        cardEl: card,
      });
      this.crafterControlRows.push({
        slot: card.dataset.cmid as ItemSlot,
        buyBtns: Array.from(card.querySelectorAll<HTMLElement>(".mc-main-btn")),
      });
    });
    this.orderRows = [];
    this.els.crafters.querySelectorAll<HTMLElement>("[data-cmid]").forEach((card) => {
      const slot = card.dataset.cmid as ItemSlot;
      const orderRow = card.querySelector<HTMLElement>("[data-oid]");
      if (orderRow) {
        this.orderRows.push({
          slot,
          queueEl: orderRow.querySelector<HTMLElement>("[data-oqueue]")!,
          enqueueBtns: [orderRow.querySelector<HTMLElement>("[data-act=\"craft\"]")!],
        });
      }
    });
  }

  private renderCoreSlots(kind: MachineTargetKind, id: string, cores: Array<Item | null>): string {
    if (!this.currentState?.progress.coreUnlocked) return "";
    return `<div class="core-slots">
      ${cores
        .map((core, index) =>
          core
            ? `<div class="core-slot-wrap">
                 <button
                   class="core-slot core-slot--filled ${rarityClassName(core.rarity)}"
                   data-act="openCore"
                   data-kind="${kind}"
                   data-target-id="${id}"
                   data-slot-index="${index}"
                   data-eqtip="core:${core.uid}"
                   data-core-uid="${core.uid}"
                 >${core.icon} ${core.name}</button>
                 <button
                   class="core-slot-x"
                   aria-label="卸下核心"
                   title="卸下核心"
                   data-act="unsocketCore"
                   data-kind="${kind}"
                   data-target-id="${id}"
                   data-slot-index="${index}"
                 >×</button>
               </div>`
            : `<div class="core-slot-wrap">
                 <button class="core-slot" data-act="openCore" data-kind="${kind}" data-target-id="${id}" data-slot-index="${index}">核心槽 ${index + 1}</button>
               </div>`,
        )
        .join("")}
    </div>`;
  }

  /** 生產頁：製裝訂單列（＋N 入列、佇列數、清空）。 */
  private renderCrafterOrder(slot: Slot, state: GameState): string {
    const r = RECIPES[slot];
    const c = state.crafters[slot];
    const qty = this.craftOrderQty[slot] ?? 1;
    return `<div class="craft-row" data-oid="${slot}">
      <span class="cb-base cb-base--tip" title="${describeStats(r.base)}">基底</span>
      <span class="cb-queue">佇列 <b data-oqueue>${c?.queue ?? 0}</b></span>
      <span class="cb-acts cb-acts--primary">
        <button class="craft-btn craft-btn--main" data-act="craft" data-arg="${slot}" data-qty="${qty}">製造 ${qty}（${cost(scaleCost(r.cost, qty))}）</button>
      </span>
      <span class="cb-acts cb-acts--qty">
        ${renderQtyButtons("selectCraftQty", slot, qty, "craft-btn x10", [1, 10, 100, 1000, 10000])}
      </span>
      <span class="cb-acts cb-acts--secondary">
        <button class="craft-btn clear" data-act="clearQueue" data-arg="${slot}">清空</button>
      </span>
    </div>`;
  }

  private renderCoreCrafterMachine(state: GameState): string {
    const c = state.coreCrafter;
    const buildQty = this.crafterBuildQty.core ?? 1;
    const buildCost = totalMachinePurchaseCost(CORE_MACHINE.buildCost, c.count, buildQty);
    const qty = this.craftOrderQty.core ?? 1;
    return `<div class="machine-card crafter-card" data-cmid="core">
      <div class="mc-top">
        <div class="mc-title">
          <span class="mb-icon">${CORE_RECIPE.icon}</span>
          <span class="mb-name">${CORE_RECIPE.name}機 <span class="mb-own" data-ccount>${c.active}/${c.count}</span></span>
        </div>
        <button class="mc-toggle${c.active > 0 ? "" : " paused"}" data-act="toggleCoreCrafter">${c.active > 0 ? "運轉中" : "已暫停"}</button>
      </div>
      <span class="mb-recipe">${cost(CORE_RECIPE.cost)} → 核心 / ${CORE_MACHINE.cycleTime}s</span>
      <span class="cell-bar mc-bar"><i data-cbar></i></span>
      <span class="cell-bar mc-bar mc-bar--productivity"><i data-corepbar></i></span>
      ${this.renderCoreSlots("coreCrafter", CORE_RECIPE.id, c.cores)}
      <div class="craft-row" data-oid="core">
        <span class="cb-base">固定 1 詞＋變動 0~2 詞</span>
        <span class="cb-queue">佇列 <b data-oqueue>${c.queue}</b></span>
        <span class="cb-acts cb-acts--primary">
          <button class="craft-btn craft-btn--main" data-act="craft" data-arg="core" data-qty="${qty}">製造 ${qty}（${cost(scaleCost(CORE_RECIPE.cost, qty))}）</button>
        </span>
        <span class="cb-acts cb-acts--qty">
          ${renderQtyButtons("selectCraftQty", "core", qty, "craft-btn x10", [1, 10, 100, 1000, 10000])}
        </span>
        <span class="cb-acts cb-acts--secondary">
          <button class="craft-btn clear" data-act="clearQueue" data-arg="core">清空</button>
        </span>
      </div>
      <div class="mc-btns mc-btns--primary">
        <button class="mc-main-btn" data-act="craftCoreCrafter" data-qty="${buildQty}">增加機台 ${buildQty}（${cost(buildCost)}）</button>
      </div>
      <div class="mc-btns mc-btns--qty">
        ${renderQtyButtons("selectCrafterBuildQty", "core", buildQty, "mc-mini-btn", [1, 10, 100, 1000, 10000])}
      </div>
      <div class="mc-btns mc-btns--secondary">
        <button class="mc-mini-btn" data-act="openFilter" data-arg="core">過濾器</button>
      </div>
    </div>`;
  }

  private renderBagTabs(): void {
    const filterButtons: Array<{ key: ItemSlot | "all"; label: string }> = [
      { key: "all", label: "全部" },
      { key: "weapon", label: "武器" },
      { key: "armor", label: "防具" },
      { key: "accessory", label: "飾品" },
      { key: "core", label: "核心" },
    ];
    this.els.bagTabs.innerHTML = `
      <div class="bag-tab-row">
        <button class="tab-btn${this.activeBagTab === "main" ? " sel" : ""}" data-act="bagTab" data-arg="main">主背包</button>
        <button class="tab-btn${this.activeBagTab === "warehouse" ? " sel" : ""}" data-act="bagTab" data-arg="warehouse">倉庫</button>
      </div>
      <div class="bag-filter-row">
        ${filterButtons
          .map((filter) => `<button class="tab-btn bag-filter-btn${this.activeBagFilter === filter.key ? " sel" : ""}" data-act="bagFilter" data-arg="${filter.key}">${filter.label}</button>`)
          .join("")}
      </div>
    `;
    const warehouseTitle = this.root.querySelector("[data-bag-warehouse-title]") as HTMLElement | null;
    const equipHint = this.root.querySelector("[data-bag-equip-hint]") as HTMLElement | null;
    const equipTitle = this.root.querySelector("[data-bag-equip-title]") as HTMLElement | null;
    if (warehouseTitle) warehouseTitle.style.display = this.activeBagTab === "warehouse" ? "" : "none";
    if (equipHint) equipHint.style.display = this.activeBagTab === "main" ? "" : "none";
    if (equipTitle) equipTitle.style.display = this.activeBagTab === "main" ? "" : "none";
  }

  private renderFilterModal(state: GameState | null): void {
    if (!state || !this.filterModalSlot) {
      this.filterModalEl.hidden = true;
      this.filterModalEl.innerHTML = "";
      return;
    }

    const slot = this.filterModalSlot;
    const defs = slot === "core" ? CORE_RECIPE.affixPool : RECIPES[slot].affixPool;
    const labelOf = (st: string) => st === "__any__" ? "任何詞綴" : defs.find((d) => d.stat === st)?.label ?? st;
    const entries = state.filters[slot] ?? [];
    const list = entries.length
      ? entries
          .map(
            (e, i) =>
              `<span class="fs-entry">${describeFilterEntry(e, labelOf)}
              <button class="fs-x" data-act="filterDel" data-arg="${slot}:${i}">✕</button></span>`,
          )
          .join("")
      : `<span class="fs-none">尚未設定條件</span>`;
    const opts = [
      ...(slot === "core" ? [`<option value="__any__">任何詞綴</option>`] : []),
      ...defs.map((d) => `<option value="${d.stat}">${d.label}</option>`),
    ].join("");
    const tiers = Array.from({ length: 8 }, (_, k) => `<option value="${k + 1}">T${k + 1} 以上</option>`).join("");
    const averageCrafts = estimateFilterAverageCrafts(state, slot);
    const estimateText = averageCrafts
      ? `平均每製作 ${formatAverageCrafts(averageCrafts)} 件，可得到 1 件符合目前設定的${ITEM_SLOT_NAME[slot]}。`
      : `以目前設定估算，平均超過 ${formatAverageCrafts(20000)} 件仍可能做不到 1 件。`;

    this.filterModalEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${ITEM_SLOT_NAME[slot]} 過濾器">
        <div class="modal-head">
          <h3>${ITEM_SLOT_NAME[slot]} 過濾器</h3>
          <button class="modal-close" data-act="closeFilter">關閉</button>
        </div>
        <p class="hint">不符條件的新裝會自動進倉庫；空條件代表全留。</p>
        <div class="fs-list">${list}</div>
        <div class="fs-add">
          <select data-fstat="${slot}">${opts}</select>
          <select data-ftier="${slot}">${tiers}</select>
          <button class="fs-add-btn" data-act="filterAdd" data-arg="${slot}">新增條件</button>
        </div>
        <div class="fs-quick">
          <div class="fs-quick__label">變動詞綴數</div>
          <div class="fs-quick__row">
            ${[1, 2, 3, 4]
              .map((count) => `<button class="fs-quick-btn" data-act="filterAddQuick" data-arg="${slot}" data-value="__minAffixes__:${count}">至少 ${count} 詞</button>`)
              .join("")}
          </div>
        </div>
        <div class="fs-quick">
          <div class="fs-quick__label">稀有度</div>
          <div class="fs-quick__row">
            <button class="fs-quick-btn" data-act="filterAddQuick" data-arg="${slot}" data-value="__minRarity__:magic">至少魔法</button>
            <button class="fs-quick-btn" data-act="filterAddQuick" data-arg="${slot}" data-value="__minRarity__:rare">至少稀有</button>
          </div>
        </div>
        <div class="fs-estimate">${estimateText}</div>
        <button class="btn-sweep" data-act="filterSweep">套用到現有背包</button>
      </div>
    `;
    this.filterModalEl.hidden = false;
  }

  private renderCoreModal(state: GameState | null): void {
    if (!state || !this.coreTarget) {
      this.coreModalEl.hidden = true;
      this.coreModalEl.innerHTML = "";
      return;
    }
    const main = state.equipmentInv.filter((item) => item.kind === "core");
    const ware = state.warehouseInv.filter((item) => item.kind === "core");
    const renderList = (items: Item[], act: "socketCoreInv" | "socketCoreWare") =>
      items.length
        ? items.map((item) => `<div class="inv-item ${rarityClassName(item.rarity)}">
            <button class="item-lock${item.locked ? " locked" : ""}" data-act="toggleLock" data-arg="${item.uid}" title="${item.locked ? "解鎖" : "上鎖"}">${item.locked ? "🔒" : "🔓"}</button>
            <span class="ii-name">${item.icon} ${item.name}</span>
            <span class="ii-stats">${describeEquip(item, state)}</span>
            <span class="ii-btns"><button data-act="${act}" data-arg="${item.uid}">裝入</button></span>
          </div>`).join("")
        : `<p class="empty-note">沒有可用核心。</p>`;
    this.coreModalEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="選擇核心">
        <div class="modal-head">
          <h3>選擇核心</h3>
          <button class="modal-close" data-act="closeCore">關閉</button>
        </div>
        <h4>主背包</h4>
        <div class="equip-inv">${renderList(main, "socketCoreInv")}</div>
        <h4>倉庫</h4>
        <div class="warehouse">${renderList(ware, "socketCoreWare")}</div>
      </div>
    `;
    this.coreModalEl.hidden = false;
  }

  private renderEquipInv(state: GameState): void {
    this.lastEquipLen = state.equipmentInv.length;
    this.els.equipInv.style.display = this.activeBagTab === "main" ? "" : "none";
    const filteredItems = state.equipmentInv.filter((item) => this.matchesBagFilter(item));
    if (state.equipmentInv.length === 0) {
      this.els.equipInv.innerHTML = `<p class="empty-note">尚無裝備，去製裝吧。</p>`;
      return;
    }
    const head = `<div class="inv-head">
      <span>${filteredItems.length} / ${state.equipmentInv.length} 件</span>
      <button class="ghost btn-discard-all" data-act="moveAllToWarehouse">全部移至倉庫</button>
    </div>`;
    const items = filteredItems
      .slice(0, INV_RENDER_CAP)
      .map(
        (eq) => `<div class="inv-item ${rarityClassName(eq.rarity)}" data-uid="${eq.uid}" data-bag="main" data-eqtip="main:${eq.uid}">
        <button class="item-lock${eq.locked ? " locked" : ""}" data-act="toggleLock" data-arg="${eq.uid}" title="${eq.locked ? "解鎖" : "上鎖"}">${eq.locked ? "🔒" : "🔓"}</button>
        <span class="ii-name">${eq.icon} ${eq.name}${eq.kind === "core" ? " <span class=\"slot-tag\">核心</span>" : ""} <span class="ii-cnt">${countVariableAffixes(eq)}詞</span></span>
        <span class="ii-stats">${describeEquip(eq, state)}</span>
        <span class="ii-btns">
          ${eq.kind === "equipment" ? `<button data-act="equip" data-arg="${eq.uid}">裝備</button>` : ""}
          <button class="ghost" data-act="toWare" data-arg="${eq.uid}">→庫</button>
        </span>
      </div>`,
      )
      .join("");
    const more = filteredItems.length - INV_RENDER_CAP;
    const moreNote =
      more > 0 ? `<p class="empty-note">…還有 ${more} 件（已隱藏以維持效能）</p>` : "";
    const emptyFiltered = filteredItems.length === 0 ? `<p class="empty-note">目前篩選下沒有道具。</p>` : "";
    this.els.equipInv.innerHTML = head + emptyFiltered + items + moreNote;
  }

  private renderResearch(): void {
    const tracks = allAffixDefs(this.currentState?.progress.coreUnlocked ?? false);
    const qty = this.dismantlerBuildQty;
    const state = this.currentState;
    const owned = state?.dismantler.count ?? 0;
    const buildCost = totalMachinePurchaseCost(DISMANTLER.buildCost, owned, qty);
    this.els.research.innerHTML = `
      <div class="dism">
        <div class="dism-top">
          <span class="dism-title">${DISMANTLER.icon} 拆解機 <b class="mb-own" data-dcount></b></span>
          <button class="mc-toggle${(state?.dismantler.active ?? 0) > 0 ? "" : " paused"}" data-act="toggleDism">${(state?.dismantler.active ?? 0) > 0 ? "運轉中" : "已暫停"}</button>
          <span class="dism-status" data-dism-status></span>
        </div>
        <span class="cell-bar dism-bar"><i data-dism-bar></i></span>
        ${this.renderCoreSlots("dismantler", DISMANTLER.id, state?.dismantler.cores ?? [null, null])}
        <div class="mc-btns mc-btns--primary">
          <button class="mc-main-btn" data-act="craftDismantler" data-qty="${qty}">增加機台 ${qty}（${cost(buildCost)}）</button>
        </div>
        <div class="mc-btns mc-btns--qty">
          ${renderQtyButtons("selectDismQty", "dism", qty, "mc-mini-btn", [1, 10, 100])}
        </div>
      </div>
      <h3 class="research-sub">基底研究（拆解該類裝備後自動累積，永久提升基底與固定詞綴）</h3>
      <div class="branks">
        ${(["weapon", "armor", "accessory", "core"] as BaseResearchSlot[])
          .map(
            (slot) => `<div class="brank" data-bslot="${slot}">
            <span class="rt-name">${baseResearchLabel(slot)} <b class="rt-bonus" data-bbonus></b></span>
            <span class="rt-prog" data-bprog></span>
            <span class="cell-bar rt-bar"><i data-bfill></i></span>
          </div>`,
          )
          .join("")}
      </div>
      <h3 class="research-sub">詞綴研究（T3 以上詞綴提供研究值）</h3>
      <div class="rtracks">
        ${tracks
          .map(
            (t) => `<div class="rtrack" data-rstat="${t.stat}">
            <span class="rt-name">${t.label} <b class="rt-bonus" data-rt-bonus></b></span>
            <span class="rt-prog" data-rt-prog></span>
            <span class="cell-bar rt-bar"><i data-rt-fill></i></span>
          </div>`,
          )
          .join("")}
      </div>`;
    this.dismCountEl = this.els.research.querySelector("[data-dcount]")!;
    this.dismCraftBtn = this.els.research.querySelector("[data-act=\"craftDismantler\"]")!;
    this.dismBar = this.els.research.querySelector("[data-dism-bar]")!;
    this.dismStatus = this.els.research.querySelector("[data-dism-status]")!;
    this.researchRows = [];
    this.els.research.querySelectorAll<HTMLElement>("[data-rstat]").forEach((row) => {
      this.researchRows.push({
        stat: row.dataset.rstat!,
        row,
        bonus: row.querySelector<HTMLElement>("[data-rt-bonus]")!,
        prog: row.querySelector<HTMLElement>("[data-rt-prog]")!,
        fill: row.querySelector<HTMLElement>("[data-rt-fill]")!,
      });
    });
    this.baseRows = [];
    this.els.research.querySelectorAll<HTMLElement>("[data-bslot]").forEach((row) => {
      this.baseRows.push({
        slot: row.dataset.bslot as BaseResearchSlot,
        row,
        bonus: row.querySelector<HTMLElement>("[data-bbonus]")!,
        prog: row.querySelector<HTMLElement>("[data-bprog]")!,
        fill: row.querySelector<HTMLElement>("[data-bfill]")!,
      });
    });
  }

  private renderReincarnation(state: GameState): void {
    const buffs = state.reincarnation.buffs;
    const researchReduction = Math.round((1 - researchStageGrowthFactor(state) / 2) * 100);
    const actions = state.reincarnation.gameCleared
      ? `<div class="reinc-picks">
          <h4>開始下一輪並選擇 1 個永久加成</h4>
          <button class="reinc-pick" data-act="reincarnate" data-arg="research">研究成長倍率 -20%<span>目前累計比原始少 ${researchReduction}%</span></button>
          <button class="reinc-pick" data-act="reincarnate" data-arg="materials">素材掉落 x1.15<span>目前 ${buffs.materials} 層</span></button>
          <button class="reinc-pick" data-act="reincarnate" data-arg="power">全能力 x1.10<span>目前 ${buffs.power} 層</span></button>
        </div>`
      : `<p class="hint">通關最後一關後，才能在這裡開始下一輪。</p>`;
    this.els.reincarnation.innerHTML = `
      <div class="reinc-card">
        <div class="reinc-cycle">目前第 <b>${state.reincarnation.cycle}</b> 輪</div>
        <div class="reinc-summary">已取得 ${buffs.research + buffs.materials + buffs.power} 個輪迴加成</div>
      </div>
      <div class="reinc-list">
        <div class="reinc-row">
          <span>研究成長倍率</span>
          <b>${buffs.research} 層</b>
          <span>目前每階 x${researchStageGrowthFactor(state).toFixed(2)}，比原始少 ${researchReduction}%</span>
        </div>
        <div class="reinc-row">
          <span>素材掉落</span>
          <b>${buffs.materials} 層</b>
          <span>目前 x${materialDropMultiplier(state).toFixed(2)}</span>
        </div>
        <div class="reinc-row">
          <span>全能力</span>
          <b>${buffs.power} 層</b>
          <span>目前 x${powerMultiplier(state).toFixed(2)}</span>
        </div>
      </div>
      ${actions}
    `;
  }

  private renderVictoryModal(state: GameState | null): void {
    if (!state?.reincarnation.victoryPending) {
      this.victoryModalEl.hidden = true;
      this.victoryModalEl.innerHTML = "";
      return;
    }

    this.victoryModalEl.innerHTML = `
      <div class="modal-card modal-card--victory" role="dialog" aria-modal="true" aria-label="通關">
        <div class="modal-head">
          <h3>恭喜通關</h3>
        </div>
        <p class="victory-copy">鍛爐已經燒到盡頭，最後的敵人也倒下了。你完成了這條工廠迴圈，現在可以帶著一縷餘燼走進下一輪。</p>
        <div class="victory-actions">
          <button class="mc-main-btn" data-act="victoryContinue">確認，繼續遊玩</button>
        </div>
        <p class="hint">如果要開始下一輪，關閉後可到「輪迴」分頁選擇永久加成。</p>
      </div>
    `;
    this.victoryModalEl.hidden = false;
  }

  private renderWarehouse(state: GameState): void {
    this.lastWareLen = state.warehouseInv.length;
    this.els.warehouse.style.display = this.activeBagTab === "warehouse" ? "" : "none";
    const filteredItems = state.warehouseInv.filter((item) => this.matchesBagFilter(item));
    if (state.warehouseInv.length === 0) {
      this.els.warehouse.innerHTML = `<p class="empty-note">倉庫是空的。</p>`;
      return;
    }
    const head = `<div class="inv-head">
      <span>${filteredItems.length} / ${state.warehouseInv.length} 件</span>
    </div>`;
    const items = filteredItems
      .slice(0, INV_RENDER_CAP)
      .map(
        (eq) => `<div class="inv-item ${rarityClassName(eq.rarity)}" data-uid="${eq.uid}" data-bag="ware" data-eqtip="ware:${eq.uid}">
        <button class="item-lock${eq.locked ? " locked" : ""}" data-act="toggleLock" data-arg="${eq.uid}" title="${eq.locked ? "解鎖" : "上鎖"}">${eq.locked ? "🔒" : "🔓"}</button>
        <span class="ii-name">${eq.icon} ${eq.name}${eq.kind === "core" ? " <span class=\"slot-tag\">核心</span>" : ""} <span class="ii-cnt">${countVariableAffixes(eq)}詞</span></span>
        <span class="ii-stats">${describeEquip(eq, state)}</span>
        <span class="ii-btns">
          <button data-act="fromWare" data-arg="${eq.uid}">←取回</button>
        </span>
      </div>`,
      )
      .join("");
    const more = filteredItems.length - INV_RENDER_CAP;
    const moreNote =
      more > 0 ? `<p class="empty-note">…還有 ${more} 件（已隱藏以維持效能）</p>` : "";
    const emptyFiltered = filteredItems.length === 0 ? `<p class="empty-note">目前篩選下沒有道具。</p>` : "";
    this.els.warehouse.innerHTML = head + emptyFiltered + items + moreNote;
  }

  private matchesBagFilter(item: Item): boolean {
    if (this.activeBagFilter === "all") return true;
    if (this.activeBagFilter === "core") return item.kind === "core";
    return item.kind === "equipment" && item.slot === this.activeBagFilter;
  }
}

// ---- ?澆?????----

/** ?券閰韌憿?嚗楊銝局?駁?嚗?靘?蝛嗉??”?具?*/
function allAffixDefs(includeCore: boolean): { stat: string; label: string }[] {
  const seen = new Set<string>();
  const out: { stat: string; label: string }[] = [];
  for (const slot of ["weapon", "armor", "accessory"] as Slot[]) {
    for (const d of RECIPES[slot].affixPool) {
      if (!seen.has(d.stat)) {
        seen.add(d.stat);
        out.push({ stat: d.stat, label: d.label });
      }
    }
  }
  if (includeCore) {
    for (const d of CORE_RECIPE.affixPool) {
      if (!seen.has(d.stat)) {
        seen.add(d.stat);
        out.push({ stat: d.stat, label: d.label });
      }
    }
  }
  return out;
}

function describeFilterEntry(entry: FilterEntry, labelOf: (stat: string) => string): string {
  if (entry.kind === "affixTier") return `${labelOf(entry.stat)} ≥ T${entry.minTier}`;
  if (entry.kind === "minVariableAffixes") return `變動詞綴至少 ${entry.count} 詞`;
  return `稀有度至少 ${rarityLabel(entry.rarity)}`;
}

function rarityLabel(rarity: ItemRarity): string {
  if (rarity === "magic") return "魔法";
  if (rarity === "rare") return "稀有";
  if (rarity === "legendary") return "傳奇";
  return "一般";
}

function baseResearchLabel(slot: BaseResearchSlot): string {
  return slot === "core" ? "核心基底" : `${SLOT_NAME[slot]}基底`;
}

function cost(c: Record<string, number>): string {
  return Object.entries(c)
    .map(([mat, q]) => `${MATERIALS[mat]?.icon ?? ""}${q}`)
    .join(" ");
}

function scaleCost(c: Record<string, number>, qty: number): Record<string, number> {
  return Object.fromEntries(Object.entries(c).map(([mat, q]) => [mat, q * qty]));
}

function renderQtyButtons(
  act: string,
  arg: string,
  selected: number,
  className = "mc-mini-btn",
  options = [1, 10, 100],
): string {
  return options
    .map((qty) => {
      const sel = qty === selected ? " sel" : "";
      return `<button class="${className}${sel}" data-act="${act}" data-arg="${arg}" data-qty="${qty}">${qty}</button>`;
    })
    .join("");
}

function describeStats(s: Partial<StatBlock>): string {
  return Object.entries(s)
    .map(([k, v]) => statLabel(k as keyof StatBlock, v as number))
    .join(" ");
}

function describeEquip(eq: Item, state: GameState): string {
  const summary = eq.kind === "equipment" && eq.slot === "weapon"
    ? getEquipmentSummaryRows(state, eq)
        .slice(0, 1)
        .map((row) => `<span class="eq-summary-line">${row.label} ${formatViewValue(row.value, row.pct)}</span>`)
        .join("<br>")
    : "";
  const base = eq.kind === "equipment"
    ? (() => {
        const baseMult = 1 + baseBonus(state, eq.slot);
        const baseTag =
          baseMult > 1 ? ` <span class="aff-buff">(+${Math.round((baseMult - 1) * 100)}%)</span>` : "";
        const baseStr = Object.entries(eq.base)
          .map(([k, v]) => statLabel(k, (v as number) * baseMult))
          .join(" ");
        return baseStr ? baseStr + baseTag : "";
      })()
    : "";
  const aff = eq.affixes.map((a) => {
    const mult = affixBonusMultiplier(state, eq, a);
    const bonus = mult - 1;
    const buff = bonus > 0 ? ` <span class="aff-buff">(+${Math.round(bonus * 100)}%)</span>` : "";
    const eff = a.value * mult;
    const val = a.pct
      ? (a.stat === "upgradeTierChance" ? formatSpecialPct(eff, 2) : Math.round(eff * 100) + "%")
      : fmtNum(eff);
    const fixed = a.fixed ? `<span class="aff-tier aff-tier--fixed">固定</span>` : "";
    return `+${val} ${a.label} <span class="aff-tier">T${a.tier}</span>${fixed}${buff}`;
  });
  return [summary, base, ...aff].filter(Boolean).join("<br>");
}

function renderTooltipRow(
  row: ReturnType<typeof getEquipmentComparisonRows>[number],
): string {
  const delta = row.delta ?? 0;
  const deltaClass = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const deltaText = delta === 0 ? "±0" : `${delta > 0 ? "+" : ""}${formatViewValue(delta, row.pct)}`;
  return `<div class="equip-tooltip__row">
    <span>${row.label}</span>
    <span class="equip-tooltip__value">${formatViewValue(row.value, row.pct)}</span>
    <span class="equip-tooltip__delta ${deltaClass}">${deltaText}</span>
  </div>`;
}

function findItemByUid(state: GameState, uid: number): Item | null {
  const direct =
    state.equipmentInv.find((item) => item.uid === uid)
    ?? state.warehouseInv.find((item) => item.uid === uid)
    ?? state.equipped.weapon
    ?? null;
  if (direct?.uid === uid) return direct;

  const equippedDirect = [
    state.equipped.armor,
    ...state.equipped.accessory,
  ].find((item) => item?.uid === uid)
    ?? null;
  if (equippedDirect) return equippedDirect;

  for (const machine of Object.values(state.machines)) {
    const core = machine.cores.find((item) => item?.uid === uid);
    if (core) return core;
  }
  for (const crafter of Object.values(state.crafters)) {
    const core = crafter.cores.find((item) => item?.uid === uid);
    if (core) return core;
  }
  return state.dismantler.cores.find((item) => item?.uid === uid)
    ?? state.coreCrafter.cores.find((item) => item?.uid === uid)
    ?? null;
}

function formatViewValue(value: number, pct: boolean): string {
  return pct ? `${Math.round(value * 100)}%` : fmtNum(value);
}

function statLabel(k: string, v: number): string {
  const val = isPctAffix(k as never)
    ? (k === "upgradeTierChance" ? formatSpecialPct(v, 2) : `${Math.round(v * 100)}%`)
    : fmtNum(v);
  return `+${val} ${affixLabel(k as never)}`;
}

function formatSpecialPct(value: number, digits: number): string {
  const pct = value * 100;
  return `${pct.toFixed(digits).replace(/\.?0+$/, "")}%`;
}

/** 撟喲?詨潭撘?嚗??其??亙?湔嚗＊蝷箔?敺?撣嗅??賊?嚗?*/
function fmtNum(n: number): string {
  return `${Math.round(n)}`;
}

function formatAverageCrafts(value: number): string {
  if (value >= 100) return `${Math.round(value)}`;
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function summarizeStageEnemies(stage: StageDef): string {
  const names = new Set<string>();
  for (const wave of stage.waves) {
    for (const enemy of wave) names.add(enemy.name);
  }
  return `敵人：${Array.from(names).join("、")}`;
}

function summarizeStageDrops(stage: StageDef): string {
  const dropMap = new Map<string, { icon: string; min: number; max: number }>();
  for (const wave of stage.waves) {
    for (const enemy of wave) {
      for (const drop of enemy.drops) {
        const current = dropMap.get(drop.material);
        const icon = MATERIALS[drop.material]?.icon ?? "";
        if (!current) {
          dropMap.set(drop.material, { icon, min: drop.min, max: drop.max });
          continue;
        }
        current.min = Math.min(current.min, drop.min);
        current.max = Math.max(current.max, drop.max);
      }
    }
  }
  return `掉落：${Array.from(dropMap.values())
    .map((drop) => `${drop.icon}${drop.min}-${drop.max}`)
    .join("、")}`;
}
