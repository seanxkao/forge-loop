import type {
  GameState,
  StatBlock,
  Equipment,
  Slot,
  Item,
  ItemSlot,
  RecipeId,
  ProductionRow,
  StageDef,
  ReincarnationBuff,
  BaseResearchSlot,
  FilterEntry,
  FilterCmp,
  FilterStat,
  ItemRarity,
  EquipSlotId,
  RuneId,
} from "../game/types.ts";
import { MATERIALS, STAGES, RECIPES, CORE_RECIPE, PROD_RECIPES } from "../game/content.ts";
import type { ProdRecipeDef } from "../game/content.ts";
import { deriveStats, attackInterval } from "../game/hero.ts";
import { RUNE_DEFS, runeAttackSpeedMore } from "../game/runes.ts";
import { getEquipmentComparisonRows, getWeaponPhysicalDps, findEquippedInEquipSlot } from "../game/equipmentView.ts";
import { affixLabel, isPctAffix } from "../game/affixMeta.ts";
import { materialDropMultiplier, powerMultiplier, researchStageGrowthFactor } from "../game/reincarnation.ts";
import { rarityClassName } from "../game/rarity.ts";
import { stageIndexById, unlockedStages, isRecipeUnlocked } from "../game/unlocks.ts";
import { clampTooltipPosition } from "./tooltipPosition.ts";
import { affixBonusMultiplier, countVariableAffixes } from "../game/itemAffixes.ts";
import { DISMANTLE_CYCLE, stageCost, dismantleableCount, baseStageCost, baseBonus, baseItemsAvailable } from "../game/research.ts";
import { estimateFilterMatches } from "../game/filter.ts";

/** 核心插槽目標：生產行（tab,row）或研究室。 */
export type CoreTarget =
  | { kind: "row"; tab: number; row: number; slotIndex: number }
  | { kind: "lab"; slotIndex: number };

export interface UICallbacks {
  onSelectStage(id: string): void;
  onToggleAutoAdvanceNext(): void;
  onPlaceMachine(tab: number, recipe: RecipeId): void;
  onAddMachine(tab: number, row: number, qty: number): void;
  onRemoveMachine(tab: number, row: number, qty: number): void;
  onToggleRowPaused(tab: number, row: number): void;
  onToggleRowAuto(tab: number, row: number): void;
  onEnqueueOrder(tab: number, row: number, qty: number): void;
  onClearOrder(tab: number, row: number): void;
  onAdjustRowStep(tab: number, row: number, kind: "machine" | "order", up: boolean): void;
  onRemoveRow(tab: number, row: number): void;
  onSetRowRecipe(tab: number, row: number, recipe: RecipeId): void;
  onAddTab(): void;
  onRenameTab(tab: number, name: string): void;
  onRemoveTab(tab: number): void;
  onToggleLab(): void;
  onEquip(uid: number): void;
  onUnequip(slot: EquipSlotId): void;
  onMoveAllToWarehouse(): void;
  onToggleItemLock(uid: number): void;
  onToWarehouse(uid: number): void;
  onFromWarehouse(uid: number): void;
  onRowFilterAdd(tab: number, row: number, stat: string, minTier: number): void;
  onRowFilterDel(tab: number, row: number, index: number): void;
  onRowFilterUpdate(tab: number, row: number, index: number, entry: FilterEntry): void;
  onBagFilterAdd(type: ItemSlot, stat: string, minTier: number): void;
  onBagFilterDel(type: ItemSlot, index: number): void;
  onBagFilterUpdate(type: ItemSlot, index: number, entry: FilterEntry): void;
  onOrganizeBag(): void;
  onSocketCore(target: CoreTarget, uid: number, fromWarehouse: boolean): void;
  onUnsocketCore(target: CoreTarget): void;
  onResearchBase(slot: BaseResearchSlot): void;
  onSelectRune(id: RuneId): void;
  onClearRune(): void;
  onVictoryContinue(): void;
  onReincarnate(buff: ReincarnationBuff): void;
  onReset(): void;
}

const SLOT_NAME: Record<Slot, string> = { weapon: "武器", armor: "防具", accessory: "飾品" };
const ITEM_SLOT_NAME: Record<ItemSlot, string> = { ...SLOT_NAME, core: "核心" };
const INV_RENDER_CAP = 100;

export class UI {
  // 檢視狀態（分頁／子分頁）開發刷新後保留：建構時讀回，變更時 persistView() 寫入。
  private view = readView();
  private activeTab: string = typeof this.view.activeTab === "string" ? this.view.activeTab : "prod"; // 右側抽屜永遠顯示一個分頁，預設生產
  private activeBagTab: "main" | "warehouse" = this.view.bagTab === "warehouse" ? "warehouse" : "main";
  private activeBagFilter: ItemSlot | "all" = isBagFilterKey(this.view.bagFilter) ? this.view.bagFilter : "all";
  private activeBattleInfoTab: "stats" | "equipped" | "runes" =
    this.view.battleInfoTab === "stats" || this.view.battleInfoTab === "runes" ? this.view.battleInfoTab : "equipped";
  private activeProdTab = typeof this.view.prodTab === "number" && this.view.prodTab >= 0 ? this.view.prodTab : 0;
  private currentState: GameState | null = null;
  private drawerEl!: HTMLElement;
  private tooltipEl!: HTMLElement;
  private filterModalEl!: HTMLElement;
  private bagFilterModalEl!: HTMLElement;
  private recipeModalEl!: HTMLElement;
  private victoryModalEl!: HTMLElement;
  private coreModalEl!: HTMLElement;
  private stageModalEl!: HTMLElement;
  private settingsModalEl!: HTMLElement;
  private tabSettingsModalEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer: number | null = null;
  private stageModalOpen = false;
  private settingsModalOpen = false;
  private tabSettingsOpen = false;
  private tabSettingsIndex: number | null = null;
  private tooltipKey: string | null = null;
  private filterTarget: { tab: number; row: number } | null = null;
  private bagFilterModalOpen = false;
  private bagFilterModalType: ItemSlot | null = null;
  private recipeTarget: { tab: number; row: number | null } | null = null;
  private activeRecipeTab: "refine" | "equipment" | "machine" =
    this.view.recipeTab === "equipment" || this.view.recipeTab === "machine" || this.view.recipeTab === "refine" ? this.view.recipeTab : "refine";
  private flashRecipeWeapon = false;
  private coreTarget: CoreTarget | null = null;
  private battleHidden = readBattleHidden();
  private panelEls: Record<string, HTMLElement> = {};
  private tabBtnEls: Record<string, HTMLElement> = {};

  private els!: {
    battleToggle: HTMLElement;
    battleActions: HTMLElement;
    battleOptions: HTMLElement;
    battleInfoTabs: HTMLElement;
    hero: HTMLElement;
    runes: HTMLElement;
    equipped: HTMLElement;
    prodTabs: HTMLElement;
    prodRows: HTMLElement;
    equipInv: HTMLElement;
    warehouse: HTMLElement;
    bagTabs: HTMLElement;
    bagFilter: HTMLElement;
    inventory: HTMLElement;
    research: HTMLElement;
    reincarnation: HTMLElement;
  };

  // 研究分頁 tick 快取
  private labCountEl: HTMLElement | null = null;
  private labBar: HTMLElement | null = null;
  private labStatus: HTMLElement | null = null;
  private researchRows: { stat: string; row: HTMLElement; bonus: HTMLElement; prog: HTMLElement; fill: HTMLElement }[] = [];
  private baseRows: { slot: BaseResearchSlot; row: HTMLElement; bonus: HTMLElement; prog: HTMLElement; fill: HTMLElement }[] = [];
  private researchDisp: Record<string, number> = {};
  private lastStages: Record<string, number> = {};
  private flashUntil: Record<string, number> = {};
  private baseResearchDisp: Record<BaseResearchSlot, number> = { weapon: 0, armor: 0, accessory: 0, core: 0 };
  private lastBaseStages: Record<BaseResearchSlot, number> = { weapon: 0, armor: 0, accessory: 0, core: 0 };
  private baseFlashUntil: Record<BaseResearchSlot, number> = { weapon: 0, armor: 0, accessory: 0, core: 0 };
  private lastCycleSeen = 1;

  // 生產行 tick 快取（僅當前子分頁）
  private prodRowCards: {
    row: number;
    bar: HTMLElement;
    prodBar: HTMLElement;
    countEl: HTMLElement;
    queueEl: HTMLElement | null;
    addBtn: HTMLElement;
    removeBtn: HTMLElement;
    orderBtn: HTMLElement;
    clearBtn: HTMLElement;
    cardEl: HTMLElement;
  }[] = [];
  private prodPlaceBtns: HTMLElement[] = []; // 空行「放置機器」鈕，無庫存時變暗
  private heroVals: Record<string, HTMLElement> = {};
  private matVals: Record<string, HTMLElement> = {};
  private matEls: Record<string, HTMLElement> = {};
  private spareMatEl: HTMLElement | null = null; // 底部素材列的組裝機庫存
  private spareMatWrap: HTMLElement | null = null;
  private labMatEl: HTMLElement | null = null; // 底部素材列的研究室台數
  private labMatWrap: HTMLElement | null = null;
  private lastWareLen = -1;
  private lastEquipLen = -1;
  private lastTickTab: string | null = null;
  private lastResearchSig = -1; // 研究／基底研究階數總和，變動時即時重繪裝備顯示

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private cb: UICallbacks) {
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="topbar">
        <h1>⚒️ Forge Loop <span class="app-version">v0.0.2</span></h1>
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
          <button class="battle-toggle" data-act="toggleBattle" data-zone="battleToggle">隱藏戰鬥</button>
          <div class="canvas-wrap">
          <div class="battle-actions" data-zone="battleActions"></div>
          <div class="battle-options" data-zone="battleOptions"></div>
        </div>
        <div class="battle-subtabs" data-zone="battleInfoTabs"></div>
        <div class="hero" data-zone="hero"></div>
        <div class="runes-panel" data-zone="runes"></div>
        <div class="equipped" data-zone="equipped"></div>
      </section>
        <aside class="drawer" data-drawer>
          <section class="panel-section" data-panel="prod">
            <h2>生產</h2>
            <p class="hint">點空行放置組裝機並選配方；機台連續吃料產出。組裝機庫存見下方素材列（用「組裝機」配方可生產更多）。</p>
            <div class="prod-subtabs" data-zone="prodTabs"></div>
            <div class="prod-rows" data-zone="prodRows"></div>
          </section>
          <section class="panel-section" data-panel="bag">
            <div class="bag-subtabs" data-zone="bagTabs"></div>
            <div class="bag-filter-edit" data-zone="bagFilter"></div>
            <div class="equip-inv" data-zone="equipInv"></div>
            <h2 data-bag-warehouse-title>倉庫</h2>
            <div class="warehouse" data-zone="warehouse"></div>
          </section>
          <section class="panel-section" data-panel="research">
            <h2>研究</h2>
            <p class="hint">研究室運轉時會自動銷毀倉庫裝備：每件推進對應類型的基底研究與固定詞綴，T3 以上的變動詞綴另外轉成詞綴研究值。詞綴研究每階永久 +10%，基底研究每階永久 +20%。研究室需用「研究室」配方生產。</p>
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
      <div class="ui-toast" data-ui-toast hidden></div>
    `;
    this.root.querySelector(".canvas-wrap")!.appendChild(this.canvas);
    this.tooltipEl = this.makeFloating("equip-tooltip", false);
    this.filterModalEl = this.makeModal(() => { this.filterTarget = null; this.renderFilterModal(this.currentState); });
    this.bagFilterModalEl = this.makeModal(() => { this.bagFilterModalOpen = false; this.renderBagFilterModal(this.currentState); });
    this.recipeModalEl = this.makeModal(() => { this.recipeTarget = null; this.renderRecipeModal(this.currentState); });
    this.coreModalEl = this.makeModal(() => { this.coreTarget = null; this.renderCoreModal(this.currentState); });
    this.victoryModalEl = this.makeModal(null);
    this.stageModalEl = this.makeModal(() => { this.stageModalOpen = false; this.renderStageModal(this.currentState); });
    this.settingsModalEl = this.makeModal(() => { this.settingsModalOpen = false; this.renderSettingsModal(); });
    this.tabSettingsModalEl = this.makeModal(() => { this.tabSettingsOpen = false; this.renderTabSettingsModal(this.currentState); });
    this.toastEl = this.root.querySelector<HTMLElement>("[data-ui-toast]")!;

    const z = (n: string) => this.root.querySelector(`[data-zone="${n}"]`) as HTMLElement;
    this.els = {
      battleToggle: z("battleToggle"),
      battleActions: z("battleActions"),
      battleOptions: z("battleOptions"),
      battleInfoTabs: z("battleInfoTabs"),
      hero: z("hero"),
      runes: z("runes"),
      equipped: z("equipped"),
      prodTabs: z("prodTabs"),
      prodRows: z("prodRows"),
      equipInv: z("equipInv"),
      warehouse: z("warehouse"),
      bagTabs: z("bagTabs"),
      bagFilter: z("bagFilter"),
      inventory: z("inventory"),
      research: z("research"),
      reincarnation: z("reincarnation"),
    };
    this.drawerEl = this.root.querySelector("[data-drawer]") as HTMLElement;
    this.panelEls = {};
    this.root.querySelectorAll<HTMLElement>("[data-panel]").forEach((el) => (this.panelEls[el.dataset.panel!] = el));
    this.tabBtnEls = {};
    this.root.querySelectorAll<HTMLElement>(".tab-btn").forEach((el) => (this.tabBtnEls[el.dataset.arg!] = el));
    this.buildHero();
    this.buildInventory();
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    this.root.addEventListener("mousemove", (e) => this.onHoverMove(e));
    this.root.addEventListener("mouseleave", () => this.hideTooltip());
    this.root.addEventListener("change", (e) => this.onFilterRuleChange(e));
    this.filterModalEl.addEventListener("change", (e) => this.onFilterRuleChange(e));
    this.bagFilterModalEl.addEventListener("change", (e) => this.onFilterRuleChange(e));
    this.applyBattleHidden();
    this.setTab(this.activeTab); // 開局即顯示預設分頁（生產）
  }

  private makeFloating(className: string, _modal: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = className;
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  private makeModal(onBackdrop: (() => void) | null): HTMLElement {
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target === el) {
        if (onBackdrop) onBackdrop();
        return;
      }
      this.onClick(e as MouseEvent);
    });
    return el;
  }

  private showToast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.classList.remove("show");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("show");
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove("show");
      this.toastEl.hidden = true;
      this.toastTimer = null;
    }, 1200);
  }

  private setTab(tab: string): void {
    this.activeTab = tab; // 永遠停在某個分頁，不再切回空白
    this.drawerEl.classList.add("open");
    for (const k in this.panelEls) this.panelEls[k].classList.toggle("active", k === this.activeTab);
    for (const k in this.tabBtnEls) this.tabBtnEls[k].classList.toggle("sel", k === this.activeTab);
    this.persistView();
  }

  /** 把分頁／子分頁檢視狀態寫入 localStorage，刷新後沿用。 */
  private persistView(): void {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({
        activeTab: this.activeTab,
        battleInfoTab: this.activeBattleInfoTab,
        bagTab: this.activeBagTab,
        bagFilter: this.activeBagFilter,
        prodTab: this.activeProdTab,
        recipeTab: this.activeRecipeTab,
      }));
    } catch { /* 忽略 */ }
  }

  private onContextMenu(e: MouseEvent): void {
    const tabBtn = (e.target as HTMLElement).closest('[data-act="prodTab"]') as HTMLElement | null;
    if (tabBtn) {
      e.preventDefault();
      this.tabSettingsIndex = Number(tabBtn.dataset.arg);
      this.tabSettingsOpen = true;
      this.renderTabSettingsModal(this.currentState);
      return;
    }
    const t = (e.target as HTMLElement).closest("[data-uid]") as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    const uid = Number(t.dataset.uid);
    if (t.dataset.bag === "ware") this.cb.onFromWarehouse(uid);
    else this.cb.onToWarehouse(uid);
  }

  private onHoverMove(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest("[data-eqtip]") as HTMLElement | null;
    if (!target || !this.currentState) { this.hideTooltip(); return; }
    const eq = this.resolveTooltipEquipment(target, this.currentState);
    if (!eq) { this.hideTooltip(); return; }
    const key = target.dataset.eqtip ?? "";
    if (key !== this.tooltipKey) {
      this.tooltipKey = key;
      this.renderTooltip(eq, this.currentState);
    }
    this.positionTooltip(e.clientX, e.clientY);
  }

  private resolveTooltipEquipment(target: HTMLElement, state: GameState): Item | null {
    const coreUid = Number(target.dataset.coreUid);
    if (Number.isFinite(coreUid) && target.dataset.coreUid !== undefined) return findItemByUid(state, coreUid);
    const slot = target.dataset.eqslot as EquipSlotId | undefined;
    if (slot) return findEquippedInEquipSlot(state, slot);
    const uid = Number(target.dataset.uid);
    if (!Number.isFinite(uid)) return null;
    if (target.dataset.bag === "ware") return state.warehouseInv.find((eq) => eq.uid === uid) ?? null;
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
      <div class="equip-tooltip__subtitle">${compareTarget ? `對比目前裝備：${compareTarget.icon} ${compareTarget.name}` : "目前裝備"}</div>
      <div class="equip-tooltip__rows">${rows.map((row) => renderTooltipRow(row)).join("")}</div>
      <div class="equip-tooltip__detail">${describeEquip(eq, state)}</div>
    `;
    this.tooltipEl.hidden = false;
  }

  private positionTooltip(x: number, y: number): void {
    const { width, height } = this.tooltipEl.getBoundingClientRect();
    const pos = clampTooltipPosition({ x, y }, { width, height }, { width: window.innerWidth, height: window.innerHeight });
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
        if (confirm("確定要重置存檔嗎？所有進度（裝備、材料、研究、關卡、生產線）將永久清除且無法復原。")) {
          this.settingsModalOpen = false;
          this.renderSettingsModal();
          this.cb.onReset();
        }
        break;
      case "openSettings": this.settingsModalOpen = true; this.renderSettingsModal(); break;
      case "closeSettings": this.settingsModalOpen = false; this.renderSettingsModal(); break;
      case "tab":
        this.setTab(arg);
        if (arg === "bag" && this.currentState?.progress.craftedEquipmentOnce && !this.currentState.progress.bagGuideSeen) {
          this.currentState.progress.bagGuideSeen = true;
          this.renderBagTabs();
        }
        break;
      case "stage":
        this.stageModalOpen = false;
        this.renderStageModal(this.currentState);
        this.cb.onSelectStage(arg);
        break;
      case "openStageMap": this.stageModalOpen = true; this.renderStageModal(this.currentState); break;
      case "closeStageMap": this.stageModalOpen = false; this.renderStageModal(this.currentState); break;
      case "toggleAutoNext": this.cb.onToggleAutoAdvanceNext(); break;
      case "toggleBattle": this.toggleBattle(); break;
      // ---- 生產：分頁 ----
      case "prodTab":
        this.activeProdTab = Number(arg);
        this.persistView();
        if (this.currentState) this.renderProduction(this.currentState);
        break;
      case "addProdTab":
        this.cb.onAddTab();
        if (this.currentState) {
          this.activeProdTab = Math.max(0, this.currentState.production.tabs.length - 1);
          this.persistView();
          this.renderProduction(this.currentState);
        }
        break;
      case "closeTabSettings":
        this.tabSettingsOpen = false;
        this.renderTabSettingsModal(this.currentState);
        break;
      case "confirmRenameTab": {
        if (this.tabSettingsIndex !== null) {
          const input = this.tabSettingsModalEl.querySelector<HTMLInputElement>("[data-tab-name]");
          this.cb.onRenameTab(this.tabSettingsIndex, input?.value ?? "");
        }
        this.tabSettingsOpen = false;
        this.renderTabSettingsModal(this.currentState);
        break;
      }
      case "confirmDeleteTab":
        if (this.tabSettingsIndex !== null) this.cb.onRemoveTab(this.tabSettingsIndex);
        this.tabSettingsOpen = false;
        this.renderTabSettingsModal(this.currentState);
        break;
      // ---- 生產：行 ----
      case "openRecipe":
        if (t.dataset.row === undefined && (this.currentState?.spareAssemblers ?? 0) <= 0) {
          this.showToast("組裝機不足");
          break;
        }
        this.recipeTarget = { tab: Number(t.dataset.tab), row: t.dataset.row !== undefined ? Number(t.dataset.row) : null };
        // 首次引導時切到「裝備」分頁讓武器配方閃爍可見；其餘沿用上次記憶的子分頁。
        if (this.currentState && !this.currentState.progress.recipeGuideSeen) this.activeRecipeTab = "equipment";
        this.flashRecipeWeapon = !!(this.currentState && !this.currentState.progress.recipeGuideSeen);
        this.renderRecipeModal(this.currentState);
        if (this.currentState && !this.currentState.progress.recipeGuideSeen) this.currentState.progress.recipeGuideSeen = true;
        break;
      case "recipeTab":
        this.activeRecipeTab = arg === "equipment" || arg === "machine" ? arg : "refine";
        this.persistView();
        this.renderRecipeModal(this.currentState);
        break;
      case "closeRecipe": this.recipeTarget = null; this.renderRecipeModal(this.currentState); break;
      case "pickRecipe": {
        const recipe = arg as RecipeId;
        const target = this.recipeTarget;
        this.recipeTarget = null;
        this.renderRecipeModal(this.currentState);
        if (target) {
          if (target.row === null) this.cb.onPlaceMachine(target.tab, recipe);
          else this.cb.onSetRowRecipe(target.tab, target.row, recipe);
        }
        break;
      }
      case "addMachine": {
        const r = this.prodRow(Number(t.dataset.tab), Number(t.dataset.row));
        const mul = Number(t.dataset.mul) || 1;
        this.cb.onAddMachine(Number(t.dataset.tab), Number(t.dataset.row), (r?.machineStep ?? 1) * mul);
        break;
      }
      case "removeMachine": {
        const r = this.prodRow(Number(t.dataset.tab), Number(t.dataset.row));
        const mul = Number(t.dataset.mul) || 1;
        this.cb.onRemoveMachine(Number(t.dataset.tab), Number(t.dataset.row), (r?.machineStep ?? 1) * mul);
        break;
      }
      case "rowStepMul": this.cb.onAdjustRowStep(Number(t.dataset.tab), Number(t.dataset.row), t.dataset.kind === "order" ? "order" : "machine", true); break;
      case "rowStepDiv": this.cb.onAdjustRowStep(Number(t.dataset.tab), Number(t.dataset.row), t.dataset.kind === "order" ? "order" : "machine", false); break;
      case "toggleAuto": this.cb.onToggleRowAuto(Number(t.dataset.tab), Number(t.dataset.row)); break;
      case "enqueueOrder": {
        const r = this.prodRow(Number(t.dataset.tab), Number(t.dataset.row));
        const mul = Number(t.dataset.mul) || 1;
        this.cb.onEnqueueOrder(Number(t.dataset.tab), Number(t.dataset.row), (r?.orderStep ?? 1) * mul);
        break;
      }
      case "clearOrder": this.cb.onClearOrder(Number(t.dataset.tab), Number(t.dataset.row)); break;
      case "removeRow": this.cb.onRemoveRow(Number(t.dataset.tab), Number(t.dataset.row)); break;
      // ---- 背包 ----
      case "equip": this.cb.onEquip(Number(arg)); break;
      case "unequip": this.cb.onUnequip(arg as EquipSlotId); break;
      case "moveAllToWarehouse": this.cb.onMoveAllToWarehouse(); break;
      case "toggleLock": this.cb.onToggleItemLock(Number(arg)); break;
      case "toWare": this.cb.onToWarehouse(Number(arg)); break;
      case "fromWare": this.cb.onFromWarehouse(Number(arg)); break;
      case "bagTab":
        this.activeBagTab = arg === "warehouse" ? "warehouse" : "main";
        this.persistView();
        if (this.currentState) { this.renderBagTabs(); this.renderBagFilter(this.currentState); this.renderEquipInv(this.currentState); this.renderWarehouse(this.currentState); }
        break;
      case "bagFilter":
        this.activeBagFilter = arg === "all" ? "all" : (arg as ItemSlot);
        this.persistView();
        if (this.currentState) { this.renderBagTabs(); this.renderBagFilter(this.currentState); this.renderEquipInv(this.currentState); this.renderWarehouse(this.currentState); }
        break;
      case "battleInfoTab":
        this.activeBattleInfoTab = arg === "equipped" || arg === "runes" ? arg : "stats";
        this.persistView();
        if (this.currentState) { this.renderBattleInfoTabs(); this.renderHeroPanel(); this.renderEquipped(this.currentState); this.renderRunes(this.currentState); }
        break;
      case "selectRune":
        this.cb.onSelectRune(arg as RuneId);
        break;
      case "clearRune":
        this.cb.onClearRune();
        break;
      // ---- 過濾器（每行） ----
      case "openFilter":
        this.filterTarget = { tab: Number(t.dataset.tab), row: Number(t.dataset.row) };
        this.renderFilterModal(this.currentState);
        break;
      case "closeFilter": this.filterTarget = null; this.renderFilterModal(this.currentState); break;
      case "filterAdd": {
        const editor = t.closest(".fs-editor") as HTMLElement | null;
        if (!editor) break;
        const stat = (editor.querySelector("[data-fadd-stat]") as HTMLSelectElement).value;
        const tier = Number((editor.querySelector("[data-fadd-tier]") as HTMLSelectElement).value);
        this.dispatchFilterAdd(editor, stat, tier);
        break;
      }
      case "filterAddQuick": {
        const editor = t.closest(".fs-editor") as HTMLElement | null;
        if (editor) this.dispatchFilterAdd(editor, t.dataset.value ?? "", 0);
        break;
      }
      case "filterDel": {
        const editor = t.closest(".fs-editor") as HTMLElement | null;
        const bagType = editor?.dataset.bagfilter as ItemSlot | undefined;
        if (bagType) this.cb.onBagFilterDel(bagType, Number(arg));
        else if (this.filterTarget) this.cb.onRowFilterDel(this.filterTarget.tab, this.filterTarget.row, Number(arg));
        break;
      }
      case "organizeBag": this.cb.onOrganizeBag(); break;
      case "openBagFilter":
        this.bagFilterModalOpen = true;
        this.bagFilterModalType = this.activeBagFilter === "all" ? null : this.activeBagFilter;
        this.renderBagFilterModal(this.currentState);
        break;
      case "closeBagFilter":
        this.bagFilterModalOpen = false;
        this.renderBagFilterModal(this.currentState);
        break;
      case "bagFilterPickType":
        this.bagFilterModalType = arg as ItemSlot;
        this.renderBagFilterModal(this.currentState);
        break;
      // ---- 核心 ----
      case "openCore":
        this.coreTarget = this.readCoreTarget(t);
        this.renderCoreModal(this.currentState);
        break;
      case "closeCore": this.coreTarget = null; this.renderCoreModal(this.currentState); break;
      case "socketCoreInv":
        if (this.coreTarget) this.cb.onSocketCore(this.coreTarget, Number(arg), false);
        this.coreTarget = null;
        this.renderCoreModal(this.currentState);
        break;
      case "socketCoreWare":
        if (this.coreTarget) this.cb.onSocketCore(this.coreTarget, Number(arg), true);
        this.coreTarget = null;
        this.renderCoreModal(this.currentState);
        break;
      case "unsocketCore": this.cb.onUnsocketCore(this.readCoreTarget(t)); break;
      // ---- 研究室 ----
      case "researchBase": this.cb.onResearchBase(arg as BaseResearchSlot); break;
      // ---- 輪迴 ----
      case "victoryContinue": this.cb.onVictoryContinue(); break;
      case "reincarnate": this.cb.onReincarnate(arg as ReincarnationBuff); break;
    }
  }

  private readCoreTarget(t: HTMLElement): CoreTarget {
    const slotIndex = Number(t.dataset.slotIndex ?? "0");
    if (t.dataset.coreKind === "lab") return { kind: "lab", slotIndex };
    return { kind: "row", tab: Number(t.dataset.tab), row: Number(t.dataset.row), slotIndex };
  }

  /** 新增過濾規則：依編輯器所在情境（背包類型 vs 機器行）分派。 */
  private dispatchFilterAdd(editor: HTMLElement, stat: string, tier: number): void {
    const bagType = editor.dataset.bagfilter as ItemSlot | undefined;
    if (bagType) this.cb.onBagFilterAdd(bagType, stat, tier);
    else if (this.filterTarget) this.cb.onRowFilterAdd(this.filterTarget.tab, this.filterTarget.row, stat, tier);
  }

  /** 規則行的「至少/至多」或數值下拉變更時，就地更新該規則。 */
  private onFilterRuleChange(e: Event): void {
    const field = (e.target as HTMLElement).closest?.("[data-rule-field]") as HTMLElement | null;
    if (!field) return;
    const ruleEl = field.closest(".fs-rule") as HTMLElement | null;
    const editor = field.closest(".fs-editor") as HTMLElement | null;
    if (!ruleEl || !editor) return;
    const entry = readRuleEntry(ruleEl);
    const index = Number(ruleEl.dataset.ruleIndex);
    const bagType = editor.dataset.bagfilter as ItemSlot | undefined;
    if (bagType) this.cb.onBagFilterUpdate(bagType, index, entry);
    else if (this.filterTarget) this.cb.onRowFilterUpdate(this.filterTarget.tab, this.filterTarget.row, index, entry);
  }

  refresh(state: GameState): void {
    if (state.reincarnation.cycle !== this.lastCycleSeen) {
      this.resetResearchAnimationCaches();
      this.lastCycleSeen = state.reincarnation.cycle;
    }
    this.currentState = state;
    if (this.activeProdTab >= state.production.tabs.length) this.activeProdTab = Math.max(0, state.production.tabs.length - 1);
    this.renderBattleActions(state);
    this.renderEquipped(state);
    this.renderProduction(state);
    this.renderBagTabs();
    this.renderBagFilter(state);
    this.renderEquipInv(state);
    this.renderWarehouse(state);
    this.renderResearch();
    this.renderReincarnation(state);
    this.renderRunes(state);
    this.renderStageModal(state);
    this.renderFilterModal(state);
    this.renderBagFilterModal(state);
    this.renderRecipeModal(state);
    this.renderSettingsModal();
    this.renderTabSettingsModal(state);
    this.renderCoreModal(state);
    this.renderVictoryModal(state);
    const reincTab = this.root.querySelector<HTMLElement>("[data-reinc-tab]");
    this.tabBtnEls.bag?.classList.toggle("flash-guide", state.progress.craftedEquipmentOnce && !state.progress.bagGuideSeen);
    if (reincTab) reincTab.hidden = !state.reincarnation.gameCleared && state.reincarnation.cycle <= 1;
    if (this.activeTab === "reincarnation" && !state.reincarnation.gameCleared && state.reincarnation.cycle <= 1) this.setTab("prod");
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

  tick(state: GameState): void {
    this.currentState = state;
    this.tabBtnEls.bag?.classList.toggle("flash-guide", state.progress.craftedEquipmentOnce && !state.progress.bagGuideSeen);
    const s = deriveStats(state);
    const setHV = (k: string, v: string) => { const el = this.heroVals[k]; if (el) el.textContent = v; };
    setHV("hp", `${Math.ceil(Math.max(0, state.combat.heroHp))} / ${Math.round(s.hp)}`);
    setHV("atk", formatViewValue(s.atkMin, false, s.atkMax));
    setHV("def", `${Math.round(s.def)}`);
    const spdPct = Math.round((((1 + s.haste) * (1 + s.localHastePct) * runeAttackSpeedMore(state, s.hp)) - 1) * 100);
    setHV("spd", `+${spdPct}% (${(1 / attackInterval(state, s)).toFixed(2)})`);
    setHV("crit", `${Math.round(s.critChance * 100)}%`);
    setHV("critm", `${Math.round(s.critMult * 100)}%`);
    setHV("regen", `${Math.round(s.hpRegen)}/s`);
    setHV("dr", `${Math.round(s.dmgReductionPct * 100)}%`);
    setHV("block", `${Math.round(s.blockChance * 100)}%`);

    for (const id in this.matVals) {
      const n = state.inventory[id] ?? 0;
      this.matVals[id].textContent = `${n}`;
      this.matEls[id].classList.toggle("dim", n === 0);
    }
    if (this.spareMatEl) this.spareMatEl.textContent = `${state.spareAssemblers}`;
    if (this.spareMatWrap) this.spareMatWrap.classList.toggle("dim", state.spareAssemblers === 0);
    if (this.labMatEl) this.labMatEl.textContent = `${state.lab.count}`;
    if (this.labMatWrap) this.labMatWrap.classList.toggle("dim", state.lab.count === 0);

    // 研究／基底研究升階時，裝備卡上顯示的參數（含研究加成）要即時重繪——
    // 不分頁偵測階數總和變化（實際戰鬥數值走 deriveStats 本就即時，這裡只補顯示）。
    let researchSig = 0;
    for (const k in state.research.stages) researchSig += state.research.stages[k];
    for (const k in state.baseResearch) researchSig += state.baseResearch[k as BaseResearchSlot];
    if (researchSig !== this.lastResearchSig) {
      this.lastResearchSig = researchSig;
      this.renderEquipped(state);
      if (this.activeTab === "bag") {
        this.renderEquipInv(state);
        this.renderWarehouse(state);
      }
    }

    if (this.activeTab === "prod") {
      const tab = state.production.tabs[this.activeProdTab];
      const spare = state.spareAssemblers;
      // 空行放置：無庫存時變暗
      for (const btn of this.prodPlaceBtns) btn.classList.toggle("poor", spare <= 0);
      for (const card of this.prodRowCards) {
        const row = tab?.rows[card.row];
        if (!row || !row.recipe) continue;
        const def = PROD_RECIPES[row.recipe];
        card.bar.style.width = `${Math.round(Math.min(1, row.progress / def.cycleTime) * 100)}%`;
        card.prodBar.style.width = `${Math.round((row.productivity % 1) * 100)}%`;
        card.countEl.textContent = `${row.count} 台`;
        if (card.queueEl) card.queueEl.textContent = `${row.queue ?? 0}`;
        card.cardEl.classList.toggle("idle", row.idle);
        const manual = row.auto === false;
        const canAdd = spare > 0; // 還有庫存就能加（不要求加滿 X）
        card.addBtn.classList.toggle("ready", canAdd);
        card.addBtn.classList.toggle("poor", !canAdd);
        const canRemove = row.count > 1; // 只有剩 1 台時才無法再減
        card.removeBtn.classList.toggle("ready", canRemove);
        card.removeBtn.classList.toggle("poor", !canRemove);
        card.orderBtn.classList.toggle("ready", manual); // 手動模式恆可下單
        card.clearBtn.classList.toggle("ready", manual && (row.queue ?? 0) > 0);
      }
    }

    const now = performance.now();
    if (this.activeTab === "research") {
      const lab = state.lab;
      if (this.labCountEl) this.labCountEl.textContent = `${lab.count}`;
      if (this.labBar) this.labBar.style.width = lab.count > 0 ? `${Math.round((lab.progress / DISMANTLE_CYCLE) * 100)}%` : "0%";
      if (this.labStatus) {
        const dcount = dismantleableCount(state);
        this.labStatus.textContent = dcount ? `可拆 ${dcount} 件裝備` : "倉庫裡沒有可拆裝備";
      }
      for (const t of this.researchRows) {
        const stages = state.research.stages[t.stat] ?? 0;
        const pts = state.research.points[t.stat] ?? 0;
        const cost = stageCost(state, stages);
        if (this.lastStages[t.stat] === undefined) this.lastStages[t.stat] = stages;
        if (stages !== this.lastStages[t.stat]) {
          this.researchDisp[t.stat] = stageCost(state, this.lastStages[t.stat]);
          this.lastStages[t.stat] = stages;
          this.flashUntil[t.stat] = now + 700;
        }
        const prev = this.researchDisp[t.stat] ?? pts;
        const disp = prev + (pts - prev) * 0.18;
        this.researchDisp[t.stat] = disp;
        t.bonus.textContent = `+${stages * 10}%`;
        t.prog.textContent = `${Math.floor(disp)}/${cost}`;
        t.fill.style.width = `${Math.round(Math.min(1, disp / cost) * 100)}%`;
        t.row.classList.toggle("flash", (this.flashUntil[t.stat] ?? 0) > now);
      }
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
    }

    const tabSwitched = this.activeTab !== this.lastTickTab;
    this.lastTickTab = this.activeTab;
    if (this.activeTab === "bag") {
      if (tabSwitched || state.equipmentInv.length !== this.lastEquipLen) this.renderEquipInv(state);
      if (tabSwitched || state.warehouseInv.length !== this.lastWareLen) this.renderWarehouse(state);
    }
  }

  // ---- 靜態面板 ----

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
    this.els.hero.querySelectorAll<HTMLElement>("[data-hv]").forEach((el) => { this.heroVals[el.dataset.hv!] = el; });
    if (this.currentState) this.renderRunes(this.currentState);
    this.renderHeroPanel();
  }

  private renderBattleInfoTabs(): void {
    this.els.battleInfoTabs.innerHTML = `
      <div class="battle-subtab-row">
        <button class="tab-btn${this.activeBattleInfoTab === "equipped" ? " sel" : ""}" data-act="battleInfoTab" data-arg="equipped">裝備</button>
        <button class="tab-btn${this.activeBattleInfoTab === "runes" ? " sel" : ""}" data-act="battleInfoTab" data-arg="runes">符文</button>
        <button class="tab-btn${this.activeBattleInfoTab === "stats" ? " sel" : ""}" data-act="battleInfoTab" data-arg="stats">角色數據</button>
      </div>`;
  }

  private renderHeroPanel(): void {
    const showStats = this.activeBattleInfoTab === "stats";
    const showRunes = this.activeBattleInfoTab === "runes";
    this.els.hero.hidden = !showStats;
    this.els.hero.style.display = showStats ? "" : "none";
    this.els.runes.hidden = !showRunes;
    this.els.runes.style.display = showRunes ? "" : "none";
    this.els.equipped.hidden = showStats || showRunes;
    this.els.equipped.style.display = showStats || showRunes ? "none" : "flex";
  }

  private renderRunes(state: GameState): void {
    const selected = state.runes.selected;
    const cells = state.runes.owned
      .map((id) => {
        const rune = RUNE_DEFS[id];
        const isSelected = selected === id;
        return `<button class="rune-cell${isSelected ? " sel" : ""}" data-act="selectRune" data-arg="${id}">
          <span class="rune-cell__icon">${rune.icon}</span>
          <span class="rune-cell__name">${rune.name}</span>
          <span class="rune-cell__summary">${rune.summary}</span>
          <span class="rune-cell__drawback">${rune.drawback}</span>
          <span class="rune-cell__state">${isSelected ? "已配置" : "點擊配置"}</span>
        </button>`;
      })
      .join("");
    const socket = selected
      ? `<button class="rune-socket rune-socket--filled rune-socket--button" data-act="clearRune" title="卸下符文"><span class="rune-socket__icon">${RUNE_DEFS[selected].icon}</span></button>`
      : `<div class="rune-socket"><span class="rune-socket__icon">□</span></div>`;
    this.els.runes.innerHTML = `
      <div class="rune-layout">
        <div class="rune-current">
          <div class="rune-current__label">當前符文</div>
          ${socket}
        </div>
        <div class="rune-grid">${cells}</div>
      </div>`;
  }

  private buildInventory(): void {
    this.els.inventory.innerHTML = Object.values(MATERIALS)
      .map((m) => `<span class="mat" data-mat="${m.id}" title="${m.name}">${m.icon} ${m.name} <b data-mc="${m.id}">0</b></span>`)
      .join("")
      + `<span class="mat mat--assembler" title="組裝機（庫存）">🛠️ 組裝機 <b data-spare-mat>0</b></span>`
      + `<span class="mat mat--lab" title="研究室（台數）">🔬 研究室 <b data-lab-mat>0</b></span>`;
    this.matVals = {};
    this.matEls = {};
    this.els.inventory.querySelectorAll<HTMLElement>(".mat[data-mat]").forEach((el) => {
      const id = el.dataset.mat!;
      this.matEls[id] = el;
      this.matVals[id] = el.querySelector<HTMLElement>("[data-mc]")!;
    });
    this.spareMatEl = this.els.inventory.querySelector<HTMLElement>("[data-spare-mat]");
    this.spareMatWrap = this.els.inventory.querySelector<HTMLElement>(".mat--assembler");
    this.labMatEl = this.els.inventory.querySelector<HTMLElement>("[data-lab-mat]");
    this.labMatWrap = this.els.inventory.querySelector<HTMLElement>(".mat--lab");
  }

  private renderStages(state: GameState): string {
    return unlockedStages(state).map((s) => {
      const cur = s.id === state.combat.stageId ? " sel" : "";
      return `<button class="stage-btn${cur}" data-act="stage" data-arg="${s.id}" title="${s.desc}">
        <span class="stage-btn__name">${s.name}</span>
        <span class="stage-btn__desc">${summarizeStageEnemies(s)}</span>
        <span class="stage-btn__drops">${summarizeStageDrops(s)}</span>
      </button>`;
    }).join("");
  }

  /** 戰鬥畫面是否隱藏（供主迴圈跳過繪製）。 */
  isBattleHidden(): boolean {
    return this.battleHidden;
  }

  toggleBattle(): void {
    this.battleHidden = !this.battleHidden;
    try { localStorage.setItem("forge-loop-battle-hidden", this.battleHidden ? "1" : "0"); } catch { /* 忽略 */ }
    this.applyBattleHidden();
  }

  private applyBattleHidden(): void {
    const panel = this.root.querySelector(".main-battle");
    if (panel) panel.classList.toggle("battle-collapsed", this.battleHidden);
    this.els.battleToggle.textContent = this.battleHidden ? "顯示戰鬥" : "隱藏戰鬥";
  }

  private renderBattleActions(state: GameState): void {
    const currentIndex = stageIndexById(state.combat.stageId);
    const nextIndex = currentIndex + 1;
    const canAdvance = currentIndex >= 0 && nextIndex < STAGES.length && nextIndex < state.progress.unlockedStageCount;
    this.els.battleActions.innerHTML = canAdvance
      ? `<button class="battle-next-btn" data-act="openStageMap">地圖</button>
         <button class="battle-next-btn" data-act="stage" data-arg="${STAGES[nextIndex].id}">前往下一關</button>`
      : `<button class="battle-next-btn" data-act="openStageMap">地圖</button>`;
    this.els.battleOptions.innerHTML = `
      <label class="battle-check">
        <input type="checkbox" data-act="toggleAutoNext" ${state.progress.autoAdvanceNext ? "checked" : ""}>
        <span>自動前往下一關</span>
      </label>`;
  }

  private renderStageModal(state: GameState | null): void {
    if (!state || !this.stageModalOpen) { this.stageModalEl.hidden = true; this.stageModalEl.innerHTML = ""; return; }
    this.stageModalEl.innerHTML = `
      <div class="modal-card modal-card--stage" role="dialog" aria-modal="true" aria-label="地圖選關">
        <div class="modal-head"><h3>地圖選關</h3><button class="modal-close" data-act="closeStageMap">關閉</button></div>
        <div class="stages">${this.renderStages(state)}</div>
      </div>`;
    this.stageModalEl.hidden = false;
  }

  private renderSettingsModal(): void {
    if (!this.settingsModalOpen) { this.settingsModalEl.hidden = true; this.settingsModalEl.innerHTML = ""; return; }
    this.settingsModalEl.innerHTML = `
      <div class="modal-card modal-card--settings" role="dialog" aria-modal="true" aria-label="設定">
        <div class="modal-head"><h3>設定</h3><button class="modal-close" data-act="closeSettings">關閉</button></div>
        <div class="settings-list"><button class="btn-reset" data-act="reset">刪除存檔</button></div>
      </div>`;
    this.settingsModalEl.hidden = false;
  }

  private renderTabSettingsModal(state: GameState | null): void {
    const idx = this.tabSettingsIndex;
    const tab = state && idx !== null ? state.production.tabs[idx] : null;
    if (!state || !this.tabSettingsOpen || !tab) {
      this.tabSettingsModalEl.hidden = true;
      this.tabSettingsModalEl.innerHTML = "";
      return;
    }
    const safeName = tab.name.replace(/"/g, "&quot;");
    this.tabSettingsModalEl.innerHTML = `
      <div class="modal-card modal-card--tabsettings" role="dialog" aria-modal="true" aria-label="分頁設定">
        <div class="modal-head"><h3>分頁設定</h3><button class="modal-close" data-act="closeTabSettings">關閉</button></div>
        <input class="tab-name-input" data-tab-name type="text" value="${safeName}" maxlength="24" />
        <div class="tab-settings-actions">
          <button class="mc-main-btn" data-act="confirmRenameTab">改名</button>
          <button class="btn-danger" data-act="confirmDeleteTab">刪除</button>
        </div>
      </div>`;
    this.tabSettingsModalEl.hidden = false;
  }

  private renderEquipped(state: GameState): void {
    this.renderHeroPanel();
    const slots: Array<{ id: EquipSlotId; label: string; eq: Equipment | null }> = [
      { id: "weapon", label: SLOT_NAME.weapon, eq: state.equipped.weapon },
      { id: "armor", label: SLOT_NAME.armor, eq: state.equipped.armor },
      { id: "accessory1", label: "飾品 1", eq: state.equipped.accessory[0] },
      { id: "accessory2", label: "飾品 2", eq: state.equipped.accessory[1] },
    ];
    this.els.equipped.innerHTML = slots.map(({ id, label, eq }) => {
      if (!eq) return `<div class="eq-slot empty"><span class="slot-tag">${label}</span>未裝備</div>`;
      return `<div class="eq-slot ${rarityClassName(eq.rarity)}" data-eqtip="eq:${id}" data-eqslot="${id}">
        <div class="eq-slot__top">
          <span class="slot-tag">${label}</span>
          <button class="eq-x" data-act="unequip" data-arg="${id}" title="卸下">✕</button>
        </div>
        <span class="eq-name">${eq.icon} ${eq.name}</span>
        <span class="eq-stats">${describeEquip(eq, state, false)}</span></div>`;
    }).join("");
  }

  // ---- 生產分頁 ----

  private prodRow(tab: number, row: number): ProductionRow | null {
    return this.currentState?.production.tabs[tab]?.rows[row] ?? null;
  }

  private renderProduction(state: GameState): void {
    if (this.activeProdTab >= state.production.tabs.length) this.activeProdTab = Math.max(0, state.production.tabs.length - 1);
    // 子分頁列
    this.els.prodTabs.innerHTML = `
      <div class="prod-tab-row">
        ${state.production.tabs.map((tab, i) => `<button class="tab-btn${i === this.activeProdTab ? " sel" : ""}" data-act="prodTab" data-arg="${i}" title="右鍵開啟分頁設定">${tab.name}</button>`).join("")}
        <button class="tab-btn prod-tab-add" data-act="addProdTab">＋</button>
      </div>`;

    const tabIndex = this.activeProdTab;
    const tab = state.production.tabs[tabIndex];
    const rows = tab?.rows ?? [];
    const flashFirst = !state.progress.placedFirstMachine && tabIndex === 0;
    this.els.prodRows.innerHTML =
      rows.map((row, i) => this.renderProdRow(state, tabIndex, i, row)).join("") +
      `<button class="prod-row prod-row--empty${flashFirst ? " flash" : ""}" data-act="openRecipe" data-tab="${tabIndex}">＋ 放置機器</button>`;

    this.prodRowCards = [];
    this.els.prodRows.querySelectorAll<HTMLElement>("[data-prowidx]").forEach((card) => {
      this.prodRowCards.push({
        row: Number(card.dataset.prowidx),
        bar: card.querySelector<HTMLElement>("[data-pbar]")!,
        prodBar: card.querySelector<HTMLElement>("[data-ppbar]")!,
        countEl: card.querySelector<HTMLElement>("[data-pcount]")!,
        queueEl: card.querySelector<HTMLElement>("[data-queue]"),
        addBtn: card.querySelector<HTMLElement>("[data-act=\"addMachine\"]")!,
        removeBtn: card.querySelector<HTMLElement>("[data-act=\"removeMachine\"]")!,
        orderBtn: card.querySelector<HTMLElement>("[data-act=\"enqueueOrder\"]")!,
        clearBtn: card.querySelector<HTMLElement>("[data-act=\"clearOrder\"]")!,
        cardEl: card,
      });
    });
    this.prodPlaceBtns = Array.from(this.els.prodRows.querySelectorAll<HTMLElement>(".prod-row--empty"));
  }

  private renderProdRow(state: GameState, tabIndex: number, rowIndex: number, row: ProductionRow): string {
    const def = row.recipe ? PROD_RECIPES[row.recipe] : null;
    const title = def ? `${def.icon} ${def.name}` : "（空）";
    const summary = def ? recipeSummary(def) : "";
    const isItem = def?.kind === "equipment" || def?.kind === "core";
    const auto = row.auto !== false;
    const queue = row.queue ?? 0;
    const mStep = row.machineStep ?? 1;
    const oStep = row.orderStep ?? 1;
    const coreSlots = this.renderCoreSlots(state, { kind: "row", tab: tabIndex, row: rowIndex, slotIndex: 0 }, row.cores);
    const stepMul = (kind: "machine" | "order", step: number) =>
      `<button class="mc-mini-btn step-mul${step < 1_000_000 ? " ready" : ""}" data-act="rowStepMul" data-kind="${kind}" data-tab="${tabIndex}" data-row="${rowIndex}">×10</button>`;
    const stepDiv = (kind: "machine" | "order", step: number) =>
      `<button class="mc-mini-btn step-mul${step > 1 ? " ready" : ""}" data-act="rowStepDiv" data-kind="${kind}" data-tab="${tabIndex}" data-row="${rowIndex}">÷10</button>`;
    return `<div class="prod-row" data-prowidx="${rowIndex}">
      <div class="prod-row__topline">
        <div class="prod-row__headline">
          <button class="prod-row__recipe" data-act="openRecipe" data-tab="${tabIndex}" data-row="${rowIndex}">
            <span class="prod-row__title">${title}</span>
            <span class="prod-row__summary">${summary}</span>
          </button>
          <div class="prod-row__controls">
            ${isItem ? `<button class="prod-row__filter" data-act="openFilter" data-tab="${tabIndex}" data-row="${rowIndex}">過濾器${row.filter.length ? `(${row.filter.length})` : ""}</button>` : ""}
            <button class="prod-row__auto ${auto ? "on" : "off"}" data-act="toggleAuto" data-tab="${tabIndex}" data-row="${rowIndex}">${auto ? "自動製造" : "手動下單"}</button>
            <button class="prod-row__x" data-act="removeRow" data-tab="${tabIndex}" data-row="${rowIndex}" title="收回整行">✕</button>
          </div>
        </div>
        <span class="cell-bar prod-row__bar"><i data-pbar></i></span>
        <span class="cell-bar prod-row__bar prod-row__bar--prod"><i data-ppbar></i></span>
      </div>
      <div class="prod-row__lower">
        <div class="prod-row__body">
          ${coreSlots ? `<div class="prod-row__sec">${coreSlots}</div>` : ""}
          <div class="prod-row__sec prod-row__countctl">
            <span class="prod-row__count" data-pcount>${row.count} 台</span>
            <div class="prod-row__countbtns">
              <button class="mc-mini-btn" data-act="removeMachine" data-mul="10" data-tab="${tabIndex}" data-row="${rowIndex}">－${mStep * 10}</button>
              <button class="mc-mini-btn" data-act="addMachine" data-mul="10" data-tab="${tabIndex}" data-row="${rowIndex}">＋${mStep * 10}</button>
              ${stepMul("machine", mStep)}
              <button class="mc-mini-btn" data-act="removeMachine" data-tab="${tabIndex}" data-row="${rowIndex}">－${mStep}</button>
              <button class="mc-mini-btn" data-act="addMachine" data-tab="${tabIndex}" data-row="${rowIndex}">＋${mStep}</button>
              ${stepDiv("machine", mStep)}
            </div>
          </div>
        </div>
        <div class="prod-row__order${auto ? " is-auto" : ""}">
          <div class="order-box">
            <div class="order-queue">訂單 <b data-queue>${queue}</b></div>
            <div class="order-btns">
              <div class="order-stepgrid">
                <button class="mc-mini-btn" data-act="enqueueOrder" data-mul="10" data-tab="${tabIndex}" data-row="${rowIndex}">＋${oStep * 10}</button>
                ${stepMul("order", oStep)}
                <button class="mc-mini-btn" data-act="enqueueOrder" data-tab="${tabIndex}" data-row="${rowIndex}">＋${oStep}</button>
                ${stepDiv("order", oStep)}
              </div>
              <button class="mc-mini-btn order-clear" data-act="clearOrder" data-tab="${tabIndex}" data-row="${rowIndex}">清空</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  /** cores 掛在行或研究室；target 提供定位（slotIndex 會逐槽覆寫）。 */
  private renderCoreSlots(state: GameState, target: CoreTarget, cores: Array<Item | null>): string {
    if (!state.progress.coreUnlocked) return "";
    const attrs = target.kind === "lab" ? `data-core-kind="lab"` : `data-core-kind="row" data-tab="${target.tab}" data-row="${target.row}"`;
    return `<div class="core-slots">${cores.map((core, index) => core
      ? `<div class="core-slot-wrap">
           <button class="core-slot core-slot--filled ${rarityClassName(core.rarity)}" data-act="openCore" ${attrs} data-slot-index="${index}" data-eqtip="core:${core.uid}" data-core-uid="${core.uid}" title="${core.name}">${core.icon}</button>
           <button class="core-slot-x" aria-label="卸下核心" title="卸下核心" data-act="unsocketCore" ${attrs} data-slot-index="${index}">×</button>
         </div>`
      : `<div class="core-slot-wrap"><button class="core-slot core-slot--empty" data-act="openCore" ${attrs} data-slot-index="${index}" title="核心槽 ${index + 1}">＋</button></div>`
    ).join("")}</div>`;
  }

  private renderRecipeModal(state: GameState | null): void {
    if (!state || !this.recipeTarget) { this.recipeModalEl.hidden = true; this.recipeModalEl.innerHTML = ""; return; }
    const recipeGroups: Record< "equipment" | "refine" | "machine", ProdRecipeDef[]> = {
      refine: [],
      equipment: [],
      machine: [],
    };
    for (const def of Object.values(PROD_RECIPES)) {
      if (!isRecipeUnlocked(state, def.id)) continue;
      if (def.kind === "refine") recipeGroups.refine.push(def);
      else if (def.kind === "equipment" || def.kind === "core") recipeGroups.equipment.push(def);
      else if (def.kind === "assembler" || def.kind === "lab") recipeGroups.machine.push(def);
    }
    const tabs: Array<{ key: "equipment" | "refine" | "machine"; label: string }> = [
      { key: "equipment", label: "裝備" },
      { key: "refine", label: "精煉" },
      { key: "machine", label: "機器" },
    ];
    const activeTab = tabs.find((tab) => recipeGroups[tab.key].length > 0 && tab.key === this.activeRecipeTab)?.key
      ?? tabs.find((tab) => recipeGroups[tab.key].length > 0)?.key
      ?? "refine";
    this.activeRecipeTab = activeTab;
    const cells = recipeGroups[activeTab]
      .map((def) => `<button class="recipe-cell${this.flashRecipeWeapon && def.id === "weapon" ? " flash-guide" : ""}" data-act="pickRecipe" data-arg="${def.id}">
        <span class="recipe-cell__icon">${def.icon}</span>
        <span class="recipe-cell__name">${def.name}</span>
        <span class="recipe-cell__summary">${recipeSummary(def)}</span>
      </button>`)
      .join("");
    this.recipeModalEl.innerHTML = `
      <div class="modal-card modal-card--recipe" role="dialog" aria-modal="true" aria-label="選擇配方">
        <div class="modal-head"><h3>${this.recipeTarget.row === null ? "放置組裝機 — 選擇配方" : "變更配方"}</h3><button class="modal-close" data-act="closeRecipe">關閉</button></div>
        ${this.recipeTarget.row === null && state.spareAssemblers <= 0 ? `<p class="hint">沒有庫存組裝機了——先用「組裝機」配方生產更多。</p>` : ""}
        <div class="recipe-subtabs">
          ${tabs.map((tab) => `<button class="tab-btn recipe-subtab${activeTab === tab.key ? " sel" : ""}" data-act="recipeTab" data-arg="${tab.key}"${recipeGroups[tab.key].length > 0 ? "" : " disabled"}>${tab.label}</button>`).join("")}
        </div>
        ${cells ? "" : `<p class="empty-note">此分類目前沒有已解鎖配方。</p>`}
        <div class="recipe-grid">${cells}</div>
      </div>`;
    this.recipeModalEl.hidden = false;
    this.flashRecipeWeapon = false;
  }

  private renderBagTabs(): void {
    const filterButtons: Array<{ key: ItemSlot | "all"; label: string }> = [
      { key: "all", label: "全部" }, { key: "weapon", label: "武器" }, { key: "armor", label: "防具" }, { key: "accessory", label: "飾品" }, { key: "core", label: "核心" },
    ];
    this.els.bagTabs.innerHTML = `
      <div class="bag-tab-row">
        <button class="tab-btn${this.activeBagTab === "main" ? " sel" : ""}" data-act="bagTab" data-arg="main">主背包</button>
        <button class="tab-btn${this.activeBagTab === "warehouse" ? " sel" : ""}" data-act="bagTab" data-arg="warehouse">倉庫</button>
      </div>
      <div class="bag-filter-row">
        ${filterButtons.map((f) => `<button class="tab-btn bag-filter-btn${this.activeBagFilter === f.key ? " sel" : ""}" data-act="bagFilter" data-arg="${f.key}">${f.label}</button>`).join("")}
      </div>`;
    const warehouseTitle = this.root.querySelector("[data-bag-warehouse-title]") as HTMLElement | null;
    const equipHint = this.root.querySelector("[data-bag-equip-hint]") as HTMLElement | null;
    const equipTitle = this.root.querySelector("[data-bag-equip-title]") as HTMLElement | null;
    if (warehouseTitle) warehouseTitle.style.display = this.activeBagTab === "warehouse" ? "" : "none";
    if (equipHint) equipHint.style.display = this.activeBagTab === "main" ? "" : "none";
    if (equipTitle) equipTitle.style.display = this.activeBagTab === "main" ? "" : "none";
  }

  private renderFilterModal(state: GameState | null): void {
    const target = this.filterTarget;
    const row = target ? state?.production.tabs[target.tab]?.rows[target.row] : null;
    const def = row?.recipe ? PROD_RECIPES[row.recipe] : null;
    if (!state || !target || !row || !def || !(def.kind === "equipment" || def.kind === "core")) {
      this.filterModalEl.hidden = true;
      this.filterModalEl.innerHTML = "";
      return;
    }
    const slot: ItemSlot = def.kind === "core" ? "core" : (def.slot as ItemSlot);
    const est = estimateFilterMatches(state, slot, row.cores, row.filter);
    const estimateText = est
      ? `成功率 <b class="fs-estimate__num">${formatSuccessPct(est.matches / est.samples)}</b>（模擬生產 ${est.samples.toLocaleString("en-US")} 次中，可得到 ${est.matches.toLocaleString("en-US")} 件被保留的${ITEM_SLOT_NAME[slot]}）`
      : `尚未設定規則，這條生產線的產物都會進主背包。`;
    this.filterModalEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${ITEM_SLOT_NAME[slot]} 生產過濾器">
        <div class="modal-head"><h3>${ITEM_SLOT_NAME[slot]} 生產過濾器（此生產線）</h3><button class="modal-close" data-act="closeFilter">關閉</button></div>
        ${renderFilterEditor(slot, row.filter, "")}
        <div class="fs-estimate">${estimateText}</div>
      </div>`;
    this.filterModalEl.hidden = false;
  }

  /** 背包整理：主背包頁顯示「整理背包」鈕，點開跳出整理過濾器視窗。 */
  private renderBagFilter(_state: GameState): void {
    if (this.activeBagTab !== "main") {
      this.els.bagFilter.innerHTML = "";
      this.els.bagFilter.hidden = true;
      return;
    }
    this.els.bagFilter.hidden = false;
    this.els.bagFilter.innerHTML = `<div class="bag-organize">
      <button class="btn-sweep" data-act="openBagFilter">整理背包</button>
    </div>`;
  }

  /** 背包整理過濾器視窗：先選道具類型（背包已篩特定類型則直接帶入），再編輯該類型規則。 */
  private renderBagFilterModal(state: GameState | null): void {
    if (!state || !this.bagFilterModalOpen) {
      this.bagFilterModalEl.hidden = true;
      this.bagFilterModalEl.innerHTML = "";
      return;
    }
    const type = this.bagFilterModalType;
    let body: string;
    if (!type) {
      const types: ItemSlot[] = ["weapon", "armor", "accessory", "core"];
      body = `<p class="fs-head-note">選擇要整理的道具類型：</p>
        <div class="bag-type-pick">
          ${types.map((t) => `<button class="recipe-cell" data-act="bagFilterPickType" data-arg="${t}">${ITEM_SLOT_NAME[t]}</button>`).join("")}
        </div>`;
    } else {
      const back = this.activeBagFilter === "all"
        ? `<button class="fs-quick-btn" data-act="bagFilterPickType" data-arg="">↩ 換類型</button>`
        : "";
      body = `${renderFilterEditor(type, state.bagFilters[type] ?? [], `data-bagfilter="${type}"`)}
        <div class="bag-organize bag-organize--modal">
          <button class="btn-sweep" data-act="organizeBag">整理背包</button>
          ${back}
        </div>`;
    }
    this.bagFilterModalEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="整理背包">
        <div class="modal-head"><h3>整理背包${type ? ` — ${ITEM_SLOT_NAME[type]}` : ""}</h3><button class="modal-close" data-act="closeBagFilter">關閉</button></div>
        ${body}
      </div>`;
    this.bagFilterModalEl.hidden = false;
  }

  private renderCoreModal(state: GameState | null): void {
    if (!state || !this.coreTarget) { this.coreModalEl.hidden = true; this.coreModalEl.innerHTML = ""; return; }
    const main = state.equipmentInv.filter((item) => item.kind === "core");
    const list = main.length
      ? main.map((item) => `<div class="inv-item ${rarityClassName(item.rarity)}">
          <button class="item-lock${item.locked ? " locked" : ""}" data-act="toggleLock" data-arg="${item.uid}" title="${item.locked ? "解鎖" : "上鎖"}">${item.locked ? "🔒" : "🔓"}</button>
          <span class="ii-name">${item.icon} ${item.name}</span>
          <span class="ii-stats">${describeEquip(item, state, false)}</span>
          <span class="ii-btns"><button data-act="socketCoreInv" data-arg="${item.uid}">裝入</button></span>
        </div>`).join("")
      : `<p class="empty-note">主背包沒有可用核心（倉庫的核心無法直接裝入，需先取回主背包）。</p>`;
    this.coreModalEl.innerHTML = `
      <div class="modal-card modal-card--core" role="dialog" aria-modal="true" aria-label="選擇核心">
        <div class="modal-head"><h3>選擇核心</h3><button class="modal-close" data-act="closeCore">關閉</button></div>
        <div class="equip-inv">${list}</div>
      </div>`;
    this.coreModalEl.hidden = false;
  }

  private renderEquipInv(state: GameState): void {
    this.lastEquipLen = state.equipmentInv.length;
    this.els.equipInv.style.display = this.activeBagTab === "main" ? "" : "none";
    const filteredItems = state.equipmentInv.filter((item) => this.matchesBagFilter(item));
    if (state.equipmentInv.length === 0) { this.els.equipInv.innerHTML = `<p class="empty-note">尚無裝備，去生產線做吧。</p>`; return; }
    const head = `<div class="inv-head"><span>${filteredItems.length} / ${state.equipmentInv.length} 件</span></div>`;
    let flashedEquipButton = false;
    const items = filteredItems.slice(0, INV_RENDER_CAP).map((eq) => {
      const shouldFlashEquip = eq.kind === "equipment"
        && state.progress.craftedEquipmentOnce
        && !state.progress.equippedGuideSeen
        && !flashedEquipButton;
      if (shouldFlashEquip) flashedEquipButton = true;
      return `<div class="inv-item ${rarityClassName(eq.rarity)}" data-uid="${eq.uid}" data-bag="main" data-eqtip="main:${eq.uid}">
        <button class="item-lock${eq.locked ? " locked" : ""}" data-act="toggleLock" data-arg="${eq.uid}" title="${eq.locked ? "解鎖" : "上鎖"}">${eq.locked ? "鎖" : "開"}</button>
        <span class="ii-name">${eq.icon} ${eq.name}${eq.kind === "core" ? " <span class=\"slot-tag\">核心</span>" : ""} <span class="ii-cnt">${countVariableAffixes(eq)}詞</span></span>
        <span class="ii-stats">${describeEquip(eq, state, false)}</span>
        <span class="ii-btns">${eq.kind === "equipment" ? `<button class="${shouldFlashEquip ? "flash-guide" : ""}" data-act="equip" data-arg="${eq.uid}">裝備</button>` : ""}<button class="ghost" data-act="toWare" data-arg="${eq.uid}">倉庫</button></span>
      </div>`;
    }).join("");
    const more = filteredItems.length - INV_RENDER_CAP;
    const moreNote = more > 0 ? `<p class="empty-note">…還有 ${more} 件（已隱藏以維持效能）</p>` : "";
    const emptyFiltered = filteredItems.length === 0 ? `<p class="empty-note">目前篩選下沒有道具。</p>` : "";
    this.els.equipInv.innerHTML = head + emptyFiltered + items + moreNote;
  }

  private renderWarehouse(state: GameState): void {
    this.lastWareLen = state.warehouseInv.length;
    this.els.warehouse.style.display = this.activeBagTab === "warehouse" ? "" : "none";
    const filteredItems = state.warehouseInv.filter((item) => this.matchesBagFilter(item));
    if (state.warehouseInv.length === 0) { this.els.warehouse.innerHTML = `<p class="empty-note">倉庫是空的。</p>`; return; }
    const head = `<div class="inv-head"><span>${filteredItems.length} / ${state.warehouseInv.length} 件</span></div>`;
    const items = filteredItems.slice(0, INV_RENDER_CAP).map((eq) => `<div class="inv-item ${rarityClassName(eq.rarity)}" data-uid="${eq.uid}" data-bag="ware" data-eqtip="ware:${eq.uid}">
        <button class="item-lock${eq.locked ? " locked" : ""}" data-act="toggleLock" data-arg="${eq.uid}" title="${eq.locked ? "解鎖" : "上鎖"}">${eq.locked ? "🔒" : "🔓"}</button>
        <span class="ii-name">${eq.icon} ${eq.name}${eq.kind === "core" ? " <span class=\"slot-tag\">核心</span>" : ""} <span class="ii-cnt">${countVariableAffixes(eq)}詞</span></span>
        <span class="ii-stats">${describeEquip(eq, state, false)}</span>
        <span class="ii-btns"><button data-act="fromWare" data-arg="${eq.uid}">←取回</button></span>
      </div>`).join("");
    const more = filteredItems.length - INV_RENDER_CAP;
    const moreNote = more > 0 ? `<p class="empty-note">…還有 ${more} 件（已隱藏以維持效能）</p>` : "";
    const emptyFiltered = filteredItems.length === 0 ? `<p class="empty-note">目前篩選下沒有道具。</p>` : "";
    this.els.warehouse.innerHTML = head + emptyFiltered + items + moreNote;
  }

  private matchesBagFilter(item: Item): boolean {
    if (this.activeBagFilter === "all") return true;
    if (this.activeBagFilter === "core") return item.kind === "core";
    return item.kind === "equipment" && item.slot === this.activeBagFilter;
  }

  private renderResearch(): void {
    const state = this.currentState;
    const coreUnlocked = state?.progress.coreUnlocked ?? false;
    const tracks = allAffixDefs(coreUnlocked);
    const lab = state?.lab;
    this.els.research.innerHTML = `
      <div class="dism">
        <div class="dism-top">
          <span class="dism-title">🔬 研究室 <b class="mb-own" data-dcount>${lab?.count ?? 0}</b></span>
          <span class="dism-status" data-dism-status></span>
        </div>
        <span class="cell-bar dism-bar"><i data-dism-bar></i></span>
        ${this.renderCoreSlots(state as GameState, { kind: "lab", slotIndex: 0 }, lab?.cores ?? [null, null])}
        <p class="hint">研究室由「研究室」配方生產（生產分頁）、自動運轉；台數見下方素材列。</p>
      </div>
      <h3 class="research-sub">基底研究（拆解該類裝備後自動累積，永久提升基底與固定詞綴）</h3>
      <div class="branks">
        ${(["weapon", "armor", "accessory", "core"] as BaseResearchSlot[]).map((slot) => `<div class="brank" data-bslot="${slot}">
          <span class="rt-name">${baseResearchLabel(slot)} <b class="rt-bonus" data-bbonus></b></span>
          <span class="rt-prog" data-bprog></span>
          <span class="cell-bar rt-bar"><i data-bfill></i></span>
        </div>`).join("")}
      </div>
      <h3 class="research-sub">詞綴研究（T3 以上詞綴提供研究值）</h3>
      <div class="rtracks">
        ${tracks.map((t) => `<div class="rtrack" data-rstat="${t.stat}">
          <span class="rt-name">${t.label} <b class="rt-bonus" data-rt-bonus></b></span>
          <span class="rt-prog" data-rt-prog></span>
          <span class="cell-bar rt-bar"><i data-rt-fill></i></span>
        </div>`).join("")}
      </div>`;
    this.labCountEl = this.els.research.querySelector("[data-dcount]");
    this.labBar = this.els.research.querySelector("[data-dism-bar]");
    this.labStatus = this.els.research.querySelector("[data-dism-status]");
    this.researchRows = [];
    this.els.research.querySelectorAll<HTMLElement>("[data-rstat]").forEach((row) => {
      this.researchRows.push({ stat: row.dataset.rstat!, row, bonus: row.querySelector<HTMLElement>("[data-rt-bonus]")!, prog: row.querySelector<HTMLElement>("[data-rt-prog]")!, fill: row.querySelector<HTMLElement>("[data-rt-fill]")! });
    });
    this.baseRows = [];
    this.els.research.querySelectorAll<HTMLElement>("[data-bslot]").forEach((row) => {
      this.baseRows.push({ slot: row.dataset.bslot as BaseResearchSlot, row, bonus: row.querySelector<HTMLElement>("[data-bbonus]")!, prog: row.querySelector<HTMLElement>("[data-bprog]")!, fill: row.querySelector<HTMLElement>("[data-bfill]")! });
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
        <div class="reinc-row"><span>研究成長倍率</span><b>${buffs.research} 層</b><span>目前每階 x${researchStageGrowthFactor(state).toFixed(2)}，比原始少 ${researchReduction}%</span></div>
        <div class="reinc-row"><span>素材掉落</span><b>${buffs.materials} 層</b><span>目前 x${materialDropMultiplier(state).toFixed(2)}</span></div>
        <div class="reinc-row"><span>全能力</span><b>${buffs.power} 層</b><span>目前 x${powerMultiplier(state).toFixed(2)}</span></div>
      </div>
      ${actions}`;
  }

  private renderVictoryModal(state: GameState | null): void {
    if (!state?.reincarnation.victoryPending) { this.victoryModalEl.hidden = true; this.victoryModalEl.innerHTML = ""; return; }
    this.victoryModalEl.innerHTML = `
      <div class="modal-card modal-card--victory" role="dialog" aria-modal="true" aria-label="通關">
        <div class="modal-head"><h3>恭喜通關</h3></div>
        <p class="victory-copy">鍛爐已經燒到盡頭，最後的敵人也倒下了。你完成了這條工廠迴圈，現在可以帶著一縷餘燼走進下一輪。</p>
        <div class="victory-actions"><button class="mc-main-btn" data-act="victoryContinue">確認，繼續遊玩</button></div>
        <p class="hint">如果要開始下一輪，關閉後可到「輪迴」分頁選擇永久加成。</p>
      </div>`;
    this.victoryModalEl.hidden = false;
  }
}

// ---- 純函式輔助 ----

function recipeSummary(def: ProdRecipeDef): string {
  const out = def.kind === "refine" && def.output
    ? cost(def.output)
    : def.kind === "equipment" ? "裝備"
    : def.kind === "core" ? "核心"
    : def.kind === "assembler" ? "組裝機"
    : "研究室";
  return `${cost(def.input)} → ${out} / ${def.cycleTime}s`;
}

function allAffixDefs(includeCore: boolean): { stat: string; label: string }[] {
  const seen = new Set<string>();
  const out: { stat: string; label: string }[] = [];
  for (const slot of ["weapon", "armor", "accessory"] as Slot[]) {
    for (const d of RECIPES[slot].affixPool) {
      if (!seen.has(d.stat)) { seen.add(d.stat); out.push({ stat: d.stat, label: d.label }); }
    }
  }
  if (includeCore) {
    for (const d of CORE_RECIPE.affixPool) {
      if (!seen.has(d.stat)) { seen.add(d.stat); out.push({ stat: d.stat, label: d.label }); }
    }
  }
  return out;
}

/** 過濾規則編輯器（機器行 modal 與背包整理共用）。ctxAttr 為背包情境帶 data-bagfilter。 */
function renderFilterEditor(slot: ItemSlot, entries: FilterEntry[], ctxAttr: string): string {
  const defs = slot === "core" ? CORE_RECIPE.affixPool : RECIPES[slot].affixPool;
  const rules = entries.length
    ? entries.map((e, i) => renderRuleLine(e, i, slot)).join("")
    : `<div class="fs-none">尚未設定規則（全部保留）</div>`;
  const opts = [
    ...(slot === "core" ? [`<option value="__any__">任何詞綴</option>`] : []),
    ...defs.map((d) => `<option value="${d.stat}">${d.label}</option>`),
  ].join("");
  const tiers = Array.from({ length: 8 }, (_, k) => `<option value="${k + 1}">T${k + 1}</option>`).join("");
  return `<div class="fs-editor" ${ctxAttr}>
    <p class="fs-head-note">符合此規則的物品會被保留，其餘會回收至倉庫。</p>
    <div class="fs-list">${rules}</div>
    <div class="fs-add">
      <select data-fadd-stat>${opts}</select>
      <select data-fadd-tier>${tiers}</select>
      <button class="fs-add-btn" data-act="filterAdd">＋詞綴階規則</button>
    </div>
    <div class="fs-quick">
      ${[1, 2, 3, 4].map((c) => `<button class="fs-quick-btn" data-act="filterAddQuick" data-value="__minAffixes__:${c}">＋詞綴數 ≥ ${c}</button>`).join("")}
      <button class="fs-quick-btn" data-act="filterAddQuick" data-value="__minRarity__:magic">＋稀有度 ≥ 魔法</button>
      <button class="fs-quick-btn" data-act="filterAddQuick" data-value="__minRarity__:rare">＋稀有度 ≥ 稀有</button>
    </div>
  </div>`;
}

function renderRuleLine(entry: FilterEntry, index: number, slot: ItemSlot): string {
  const defs = slot === "core" ? CORE_RECIPE.affixPool : RECIPES[slot].affixPool;
  const labelOf = (st: string) => (st === "__any__" ? "任何詞綴" : defs.find((d) => d.stat === st)?.label ?? st);
  const cmpSel = `<select class="fs-rule__cmp" data-rule-field="cmp">
    <option value="gte"${entry.cmp === "gte" ? " selected" : ""}>至少</option>
    <option value="lte"${entry.cmp === "lte" ? " selected" : ""}>至多</option>
  </select>`;
  let name = "";
  let stat = "";
  let valueSel = "";
  if (entry.kind === "affixTier") {
    name = `${labelOf(entry.stat)} 階級`;
    stat = entry.stat;
    valueSel = `<select class="fs-rule__value" data-rule-field="value">${Array.from({ length: 8 }, (_, k) => `<option value="${k + 1}"${entry.tier === k + 1 ? " selected" : ""}>T${k + 1}</option>`).join("")}</select>`;
  } else if (entry.kind === "variableAffixes") {
    name = "變動詞綴數";
    valueSel = `<select class="fs-rule__value" data-rule-field="value">${[0, 1, 2, 3, 4].map((c) => `<option value="${c}"${entry.count === c ? " selected" : ""}>${c} 條</option>`).join("")}</select>`;
  } else {
    name = "稀有度";
    const rs: Array<[ItemRarity, string]> = [["normal", "一般"], ["magic", "魔法"], ["rare", "稀有"], ["legendary", "傳奇"]];
    valueSel = `<select class="fs-rule__value" data-rule-field="value">${rs.map(([r, l]) => `<option value="${r}"${entry.rarity === r ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  }
  return `<div class="fs-rule" data-rule-index="${index}" data-rule-kind="${entry.kind}" data-rule-stat="${stat}">
    <span class="fs-rule__name">${name}</span>${cmpSel}${valueSel}
    <button class="fs-x" data-act="filterDel" data-arg="${index}">✕</button>
  </div>`;
}

/** 從規則行的下拉狀態建出 FilterEntry（用於就地編輯）。 */
function readRuleEntry(ruleEl: HTMLElement): FilterEntry {
  const kind = ruleEl.dataset.ruleKind;
  const cmp = ((ruleEl.querySelector('[data-rule-field="cmp"]') as HTMLSelectElement).value) as FilterCmp;
  const value = (ruleEl.querySelector('[data-rule-field="value"]') as HTMLSelectElement).value;
  if (kind === "affixTier") return { kind: "affixTier", stat: ruleEl.dataset.ruleStat as FilterStat, cmp, tier: Number(value) };
  if (kind === "variableAffixes") return { kind: "variableAffixes", cmp, count: Number(value) };
  return { kind: "rarity", cmp, rarity: value as ItemRarity };
}

function baseResearchLabel(slot: BaseResearchSlot): string {
  return slot === "core" ? "核心基底" : `${SLOT_NAME[slot]}基底`;
}

function cost(c: Record<string, number>): string {
  return Object.entries(c).map(([mat, q]) => `${MATERIALS[mat]?.icon ?? ""}${q}`).join(" ");
}

function describeStats(s: Partial<StatBlock>): string {
  return Object.entries(s).map(([k, v]) => statLabel(k as keyof StatBlock, v as number)).join(" ");
}

/** 數值一律計入研究加成（生效值）；showBonus=false 時僅省略 (+X%) 標，用於精簡的裝備面板。
 *  版面：基底 → 固定詞綴 ─ 分隔線 ─ 其餘詞綴（依 stat 字母排序）─ 分隔線 ─ 物理 DPS（武器，置底）。 */
function describeEquip(eq: Item, state: GameState, showBonus = true): string {
  const dps = eq.kind === "equipment" && eq.slot === "weapon"
    ? `<div class="aff-line eq-dps">物理 DPS ${fmtNum(getWeaponPhysicalDps(state, eq))}</div>`
    : "";
  const base = eq.kind === "equipment"
    ? (() => {
        const baseMult = 1 + baseBonus(state, eq.slot);
        const baseTag = showBonus && baseMult > 1 ? ` <span class="aff-buff">(+${Math.round((baseMult - 1) * 100)}%)</span>` : "";
        const atkMin = typeof eq.base.atkMin === "number" ? eq.base.atkMin * baseMult : null;
        const atkMax = typeof eq.base.atkMax === "number" ? eq.base.atkMax * baseMult : null;
        const rows: string[] = [];
        if (atkMin !== null && atkMax !== null) rows.push(statLabel("atk", atkMin, atkMax));
        for (const [k, v] of Object.entries(eq.base)) {
          if (k === "atkMin" || k === "atkMax") continue;
          rows.push(statLabel(k, (v as number) * baseMult));
        }
        const baseStr = rows.join(" ");
        return baseStr ? `<div class="aff-line">${baseStr + baseTag}</div>` : "";
      })()
    : "";
  const affLine = (a: Item["affixes"][number]): string => {
    const mult = affixBonusMultiplier(state, eq, a);
    const bonus = mult - 1;
    const buff = showBonus && bonus > 0 ? ` <span class="aff-buff">(+${Math.round(bonus * 100)}%)</span>` : "";
    const eff = a.value * mult;
    const effMax = (a.valueMax ?? a.value) * mult;
    const val = a.pct
      ? (a.stat === "upgradeTierChance" ? formatSpecialPct(eff, 2) : Math.round(eff * 100) + "%")
      : a.stat === "atk" ? `${fmtNum(eff)}~${fmtNum(effMax)}` : fmtNum(eff);
    const tierTag = a.fixed
      ? `<span class="aff-tier aff-tier--fixed">固定</span>`
      : `<span class="aff-tier">T${a.tier}</span>`;
    return `<div class="aff-line"><span class="aff-line__main">+${val} ${a.label}${buff}</span>${tierTag}</div>`;
  };
  const fixedAff = eq.affixes.filter((a) => a.fixed).map(affLine);
  const varAff = [...eq.affixes].filter((a) => !a.fixed).sort((a, b) => a.stat.localeCompare(b.stat)).map(affLine);
  const head = [base, ...fixedAff].filter(Boolean);
  const divider = head.length && varAff.length ? `<div class="aff-divider"></div>` : "";
  return [...head, divider, ...varAff, dps].filter(Boolean).join("");
}

function renderTooltipRow(row: ReturnType<typeof getEquipmentComparisonRows>[number]): string {
  const delta = row.delta ?? 0;
  const deltaClass = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const deltaText = delta === 0 && (row.deltaMax ?? delta) === 0 ? "±0" : `${delta > 0 ? "+" : ""}${formatViewValue(delta, row.pct, row.deltaMax)}`;
  return `<div class="equip-tooltip__row"><span>${row.label}</span><span class="equip-tooltip__value">${formatViewValue(row.value, row.pct, row.valueMax)}</span><span class="equip-tooltip__delta ${deltaClass}">${deltaText}</span></div>`;
}

function findItemByUid(state: GameState, uid: number): Item | null {
  const fromBags = state.equipmentInv.find((item) => item.uid === uid) ?? state.warehouseInv.find((item) => item.uid === uid);
  if (fromBags) return fromBags;
  const equipped = [state.equipped.weapon, state.equipped.armor, ...state.equipped.accessory].find((item) => item?.uid === uid);
  if (equipped) return equipped;
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) {
      const core = row.cores.find((item) => item?.uid === uid);
      if (core) return core;
    }
  }
  return state.lab.cores.find((item) => item?.uid === uid) ?? null;
}

function formatViewValue(value: number, pct: boolean, valueMax?: number): string {
  if (pct) return `${Math.round(value * 100)}%`;
  if (typeof valueMax === "number" && Math.abs(valueMax - value) > 1e-9) return `${fmtNum(value)}~${fmtNum(valueMax)}`;
  return fmtNum(value);
}

function statLabel(k: string, v: number, vMax?: number): string {
  const val = isPctAffix(k as never)
    ? (k === "upgradeTierChance" ? formatSpecialPct(v, 2) : `${Math.round(v * 100)}%`)
    : typeof vMax === "number" && Math.abs(vMax - v) > 1e-9 ? `${fmtNum(v)}~${fmtNum(vMax)}` : fmtNum(v);
  return `+${val} ${affixLabel(k as never)}`;
}

function formatSpecialPct(value: number, digits: number): string {
  const pct = value * 100;
  return `${pct.toFixed(digits).replace(/\.?0+$/, "")}%`;
}

function fmtNum(n: number): string {
  return `${Math.round(n)}`;
}

function readBattleHidden(): boolean {
  try {
    return localStorage.getItem("forge-loop-battle-hidden") === "1";
  } catch {
    return false;
  }
}

/** 分頁／子分頁檢視狀態（刷新後沿用），與遊戲存檔分開存放。 */
interface ViewState {
  activeTab?: string;
  battleInfoTab?: "stats" | "equipped" | "runes";
  bagTab?: "main" | "warehouse";
  bagFilter?: ItemSlot | "all";
  prodTab?: number;
  recipeTab?: "refine" | "equipment" | "machine";
}
const VIEW_KEY = "forge-loop-view";

function readView(): ViewState {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as ViewState) : {};
  } catch {
    return {};
  }
}

function isBagFilterKey(v: unknown): v is ItemSlot | "all" {
  return v === "all" || v === "weapon" || v === "armor" || v === "accessory" || v === "core";
}

/** 成功率百分比：依量級調整小數位，0 顯示 0%。 */
function formatSuccessPct(ratio: number): string {
  const pct = ratio * 100;
  if (pct <= 0) return "0%";
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

function summarizeStageEnemies(stage: StageDef): string {
  const names = new Set<string>();
  for (const wave of stage.waves) for (const enemy of wave) names.add(enemy.name);
  return `敵人：${Array.from(names).join("、")}`;
}

function summarizeStageDrops(stage: StageDef): string {
  const dropMap = new Map<string, { icon: string; min: number; max: number }>();
  for (const wave of stage.waves) {
    for (const enemy of wave) {
      for (const drop of enemy.drops) {
        const current = dropMap.get(drop.material);
        const icon = MATERIALS[drop.material]?.icon ?? "";
        if (!current) { dropMap.set(drop.material, { icon, min: drop.min, max: drop.max }); continue; }
        current.min = Math.min(current.min, drop.min);
        current.max = Math.max(current.max, drop.max);
      }
    }
  }
  return `掉落：${Array.from(dropMap.values()).map((drop) => `${drop.icon}${drop.min}-${drop.max}`).join("、")}`;
}

void describeStats;
