import type { GameState, StatBlock, Equipment, Slot } from "../game/types.ts";
import { MATERIALS, STAGES, MACHINES, RECIPES, DISMANTLER, CRAFTERS } from "../game/content.ts";
import { deriveStats, attackInterval } from "../game/hero.ts";
import { canAfford } from "../game/inventory.ts";
import { getEquipmentComparisonRows, getEquipmentSummaryRows } from "../game/equipmentView.ts";
import { clampTooltipPosition } from "./tooltipPosition.ts";
import {
  stageCost,
  DISMANTLE_CYCLE,
  dismantleableCount,
  strengthBonus,
  baseStageCost,
  baseBonus,
  baseItemsAvailable,
} from "../game/research.ts";

export interface UICallbacks {
  onSelectStage(id: string): void;
  onCraftMachine(id: string, qty: number): void;
  onSetActive(id: string, delta: number): void;
  onCraft(recipeId: string, qty: number): void;
  onCraftCrafter(slot: Slot, qty: number): void;
  onSetCrafterActive(slot: Slot, delta: number): void;
  onClearCraftQueue(slot: Slot): void;
  onEquip(uid: number): void;
  onUnequip(slot: Slot): void;
  onDiscard(uid: number): void;
  onDiscardAll(): void;
  onDiscardAllWarehouse(): void;
  onToWarehouse(uid: number): void;
  onFromWarehouse(uid: number): void;
  onFilterAdd(slot: Slot, stat: string, minTier: number): void;
  onFilterDel(slot: Slot, index: number): void;
  onFilterSweep(): void;
  onCraftDismantler(): void;
  onSetDismActive(delta: number): void;
  onResearchBase(slot: Slot): void;
  onReset(): void;
}

const SLOT_NAME: Record<Slot, string> = {
  weapon: "武器",
  armor: "防具",
  accessory: "飾品",
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
  private currentState: GameState | null = null;
  private drawerEl!: HTMLElement;
  private tooltipEl!: HTMLElement;
  private filterModalEl!: HTMLElement;
  private tooltipKey: string | null = null;
  private filterModalSlot: Slot | null = null;
  private panelEls: Record<string, HTMLElement> = {};
  private tabBtnEls: Record<string, HTMLElement> = {};

  private els!: {
    stages: HTMLElement;
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
    slot: Slot;
    bonus: HTMLElement;
    prog: HTMLElement;
  }[] = [];
  private researchDisp: Record<string, number> = {}; // easing ?函?憿舐內??
  private lastStages: Record<string, number> = {}; // ?菜葫??
  private flashUntil: Record<string, number> = {}; // ???唳???嚗erformance.now嚗?

  // tick() ?函?敹怠?蝭暺?
  private machineCards: {
    id: string;
    countEl: HTMLElement;
    bar: HTMLElement;
    craftBtn: HTMLElement;
    cardEl: HTMLElement;
  }[] = [];
  // ???鋆質?璈??
  private crafterMachineCards: {
    slot: Slot;
    countEl: HTMLElement;
    bar: HTMLElement;
    craftBtn: HTMLElement;
    cardEl: HTMLElement;
  }[] = [];
  // ????鋆質?閮??
  private orderRows: {
    slot: Slot;
    queueEl: HTMLElement;
    enqueueBtns: HTMLElement[];
  }[] = [];
  private machineControlRows: { id: string; buyBtns: HTMLElement[] }[] = [];
  private crafterControlRows: { slot: Slot; buyBtns: HTMLElement[] }[] = [];
  private machineBuildQty: Record<string, number> = {};
  private crafterBuildQty: Record<Slot, number> = { weapon: 1, armor: 1, accessory: 1 };
  private craftOrderQty: Record<Slot, number> = { weapon: 1, armor: 1, accessory: 1 };
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
          <button class="tab-btn" data-act="tab" data-arg="map">🗺️ 地圖</button>
          <button class="tab-btn" data-act="tab" data-arg="prod">🏭 生產</button>
          <button class="tab-btn" data-act="tab" data-arg="bag">🎒 背包</button>
          <button class="tab-btn" data-act="tab" data-arg="research">🔬 研究</button>
          <button class="btn-reset" data-act="reset">重置存檔</button>
        </div>
      </div>
      <div class="main">
        <section class="panel main-battle">
          <div class="canvas-wrap"></div>
          <div class="hero" data-zone="hero"></div>
          <div class="equipped" data-zone="equipped"></div>
          <h2>素材</h2>
          <div class="inventory" data-zone="inventory"></div>
        </section>
        <aside class="drawer" data-drawer>
          <section class="panel-section" data-panel="map">
            <h2>地圖選擇</h2>
            <div class="stages" data-zone="stages"></div>
          </section>
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
            <p class="hint">啟動拆解器會自動銷毀倉庫裝備；每件裝備都會推進對應槽位的基底研究，而 T3 以上詞綴會另外轉成詞綴研究值。詞綴研究每階永久 +10%，基底研究每階永久 +20%。</p>
            <div class="research" data-zone="research"></div>
          </section>
        </aside>
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
    const z = (n: string) =>
      this.root.querySelector(`[data-zone="${n}"]`) as HTMLElement;
    this.els = {
      stages: z("stages"),
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

  private resolveTooltipEquipment(target: HTMLElement, state: GameState): Equipment | null {
    const slot = target.dataset.eqslot as Slot | undefined;
    if (slot) return state.equipped[slot];

    const uid = Number(target.dataset.uid);
    if (!Number.isFinite(uid)) return null;
    if (target.dataset.bag === "ware") {
      return state.warehouseInv.find((eq) => eq.uid === uid) ?? null;
    }
    return state.equipmentInv.find((eq) => eq.uid === uid) ?? null;
  }

  private renderTooltip(eq: Equipment, state: GameState): void {
    const equipped = state.equipped[eq.slot];
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
          this.cb.onReset();
        }
        break;
      case "tab":
        this.setTab(arg);
        break;
      case "stage":
        this.cb.onSelectStage(arg);
        break;
      case "craftMachine":
        this.cb.onCraftMachine(arg, Number(t.dataset.qty ?? "1"));
        break;
      case "machineActive":
        this.cb.onSetActive(arg, Number(t.dataset.delta ?? "0"));
        break;
      case "craft":
        this.cb.onCraft(arg, Number(t.dataset.qty ?? "1"));
        break;
      case "crafterActive":
        this.cb.onSetCrafterActive(arg as Slot, Number(t.dataset.delta ?? "0"));
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
        this.cb.onUnequip(arg as Slot);
        break;
      case "discard":
        this.cb.onDiscard(Number(arg));
        break;
      case "discardAll":
        this.cb.onDiscardAll();
        break;
      case "discardAllWare":
        this.cb.onDiscardAllWarehouse();
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
      case "openFilter":
        this.filterModalSlot = arg as Slot;
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
        this.cb.onFilterAdd(arg as Slot, stat, tier);
        break;
      }
      case "filterDel": {
        const [slot, idx] = arg.split(":");
        this.cb.onFilterDel(slot as Slot, Number(idx));
        break;
      }
      case "filterSweep":
        this.cb.onFilterSweep();
        break;
      case "craftDismantler":
        this.cb.onCraftDismantler();
        break;
      case "dismActive":
        this.cb.onSetDismActive(Number(arg));
        break;
      case "researchBase":
        this.cb.onResearchBase(arg as Slot);
        break;
    }
  }

  /** 雿輻??雿??澆嚗?撱箏????踴??啣翰??銝西?銝甈?live ?湔??*/
  refresh(state: GameState): void {
    this.currentState = state;
    this.renderStages(state);
    this.renderEquipped(state);
    this.renderMachines(state);
    this.renderCrafterMachines(state);
    this.renderBagTabs();
    this.renderEquipInv(state);
    this.renderWarehouse(state);
    this.renderResearch();
    this.renderFilterModal(state);
    this.tick(state);
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
    setHV("cdr", `${Math.round(s.critDmgTakenReductionPct * 100)}%`);

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
      c.countEl.textContent = `${active}/${st?.count ?? 0}`;
      c.bar.style.width =
        st && active > 0 ? `${Math.round((st.progress / def.cycleTime) * 100)}%` : "0%";
      c.cardEl.classList.toggle("idle", !!st?.idle);
      c.craftBtn.classList.toggle("poor", !canAfford(state, def.buildCost));
    }
    for (const row of this.machineControlRows) {
      const poor = !canAfford(state, MACHINES[row.id].buildCost);
      for (const btn of row.buyBtns) btn.classList.toggle("poor", poor);
    }
    // ??ˊ鋆??∠?嚗?頧?蝮賣?脣漲璇撩??璅遣???眺敺絲?
    for (const c of this.crafterMachineCards) {
      const cr = CRAFTERS[c.slot];
      const st = state.crafters[c.slot];
      const active = st?.active ?? 0;
      c.countEl.textContent = `${active}/${st?.count ?? 0}`;
      c.bar.style.width =
        st && active > 0 ? `${Math.round((st.progress / cr.cycleTime) * 100)}%` : "0%";
      c.cardEl.classList.toggle("idle", !!st?.idle);
      c.craftBtn.classList.toggle("poor", !canAfford(state, cr.buildCost));
    }
    for (const row of this.crafterControlRows) {
      const poor = !canAfford(state, CRAFTERS[row.slot].buildCost);
      for (const btn of row.buyBtns) btn.classList.toggle("poor", poor);
    }
    // ???ˊ鋆??桀?嚗??????眺敺絲?
    for (const o of this.orderRows) {
      const st = state.crafters[o.slot];
      o.queueEl.textContent = `${st?.queue ?? 0}`;
      const poorMat = !canAfford(state, scaleCost(RECIPES[o.slot].cost, this.craftOrderQty[o.slot] ?? 1));
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
    this.dismCraftBtn.classList.toggle("poor", !canAfford(state, DISMANTLER.buildCost));
    const dcount = dismantleableCount(state);
    this.dismStatus.textContent = dcount
      ? `可拆 ${dcount} 件裝備`
      : "倉庫裡沒有可拆裝備";
    for (const t of this.researchRows) {
      const stages = state.research.stages[t.stat] ?? 0;
      const pts = state.research.points[t.stat] ?? 0;
      const cost = stageCost(stages);
      if (this.lastStages[t.stat] === undefined) this.lastStages[t.stat] = stages;
      // ??嚗??脣漲璇?皛踴孛?潮?????ease ??唳???
      if (stages !== this.lastStages[t.stat]) {
        this.researchDisp[t.stat] = stageCost(this.lastStages[t.stat]);
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
      const need = baseStageCost(stages);
      const avail = baseItemsAvailable(state, b.slot);
      b.bonus.textContent = `+${Math.round(baseBonus(state, b.slot) * 100)}%`;
      b.prog.textContent = `${avail}/${need} 件進度`;
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
        <span>減暴傷承受</span><b data-hv="cdr"></b>
      </div>`;
    this.heroVals = {};
    this.els.hero.querySelectorAll<HTMLElement>("[data-hv]").forEach((el) => {
      this.heroVals[el.dataset.hv!] = el;
    });
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

  private renderStages(state: GameState): void {
    this.els.stages.innerHTML = STAGES.map((s) => {
      const cur = s.id === state.combat.stageId ? " sel" : "";
      return `<button class="stage-btn${cur}" data-act="stage" data-arg="${s.id}"
        title="${s.desc}">${s.name}</button>`;
    }).join("");
  }

  private renderEquipped(state: GameState): void {
    const slots: Slot[] = ["weapon", "armor", "accessory"];
    this.els.equipped.innerHTML = slots
      .map((slot) => {
        const eq = state.equipped[slot];
        if (!eq) {
          return `<div class="eq-slot empty"><span class="slot-tag">${SLOT_NAME[slot]}</span>未裝備</div>`;
        }
        return `<div class="eq-slot" data-eqtip="eq:${slot}" data-eqslot="${slot}"><span class="slot-tag">${SLOT_NAME[slot]}</span>
          <span class="eq-name">${eq.icon} ${eq.name}</span>
          <span class="eq-stats">${describeEquip(eq, state)}</span>
          <button data-act="unequip" data-arg="${slot}">卸下</button></div>`;
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
        return `<div class="machine-card" data-mid="${m.id}">
          <div class="mc-top">
            <span class="mb-icon">${m.icon}</span>
            <span class="mb-name">${m.name} <span class="mb-own" data-mcount>${active}/${total}</span></span>
          </div>
          <span class="mb-recipe">${cost(m.input)} → ${cost(m.output)} / ${m.cycleTime}s</span>
          <span class="cell-bar mc-bar"><i data-mbar></i></span>
          <div class="mc-btns">
            <button class="mc-main-btn" data-act="craftMachine" data-arg="${m.id}" data-qty="${qty}">增加機台 ${qty}（${cost(scaleCost(m.buildCost, qty))}）</button>
            ${renderQtyButtons("selectMachineQty", m.id, qty)}
          </div>
          <div class="mc-btns mc-btns--secondary">
            <button class="mc-step" data-act="machineActive" data-arg="${m.id}" data-delta="-1">－</button>
            <button class="mc-step" data-act="machineActive" data-arg="${m.id}" data-delta="1">＋</button>
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
        return `<div class="machine-card crafter-card" data-cmid="${slot}">
          <div class="mc-top">
            <span class="mb-icon">${r.icon}</span>
            <span class="mb-name">${r.name} <span class="mb-own" data-ccount>${active}/${total}</span></span>
          </div>
          <span class="mb-recipe">${cost(r.cost)} → 裝備 / ${cr.cycleTime}s</span>
          <span class="cell-bar mc-bar"><i data-cbar></i></span>
          <div class="mc-btns">
            <button class="mc-main-btn" data-act="craftCrafter" data-arg="${slot}" data-qty="${buildQty}">增加機台 ${buildQty}（${cost(scaleCost(cr.buildCost, buildQty))}）</button>
            ${renderQtyButtons("selectCrafterBuildQty", slot, buildQty)}
          </div>
          <div class="mc-btns mc-btns--secondary">
            <button class="mc-step" data-act="crafterActive" data-arg="${slot}" data-delta="-1">－</button>
            <button class="mc-step" data-act="crafterActive" data-arg="${slot}" data-delta="1">＋</button>
            <button class="mc-mini-btn" data-act="openFilter" data-arg="${slot}">過濾器</button>
          </div>
        </div>`;
      })
      .join("");
    this.crafterMachineCards = [];
    this.crafterControlRows = [];
    this.els.crafters.querySelectorAll<HTMLElement>("[data-cmid]").forEach((card) => {
      this.crafterMachineCards.push({
        slot: card.dataset.cmid as Slot,
        countEl: card.querySelector<HTMLElement>("[data-ccount]")!,
        bar: card.querySelector<HTMLElement>("[data-cbar]")!,
        craftBtn: card.querySelector<HTMLElement>(".mc-main-btn")!,
        cardEl: card,
      });
      this.crafterControlRows.push({
        slot: card.dataset.cmid as Slot,
        buyBtns: Array.from(card.querySelectorAll<HTMLElement>("[data-act=\"craftCrafter\"]")),
      });
    });
    this.orderRows = [];
    this.els.crafters.querySelectorAll<HTMLElement>("[data-cmid]").forEach((card) => {
      const slot = card.dataset.cmid as Slot;
      card.insertAdjacentHTML("beforeend", this.renderCrafterOrder(slot, state));
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

  /** 生產頁：製裝訂單列（＋N 入列、佇列數、清空）。 */
  private renderCrafterOrder(slot: Slot, state: GameState): string {
    const r = RECIPES[slot];
    const c = state.crafters[slot];
    const qty = this.craftOrderQty[slot] ?? 1;
    return `<div class="craft-row" data-oid="${slot}">
      <span class="cb-name">${r.icon} ${r.name}</span>
      <span class="cb-base cb-base--tip" title="${describeStats(r.base)}">基底</span>
      <span class="cb-queue">佇列 <b data-oqueue>${c?.queue ?? 0}</b></span>
      <span class="cb-acts">
        <button class="craft-btn craft-btn--main" data-act="craft" data-arg="${slot}" data-qty="${qty}">製造 ${qty}（${cost(scaleCost(r.cost, qty))}）</button>
        ${renderQtyButtons("selectCraftQty", slot, qty, "craft-btn x10")}
        <button class="craft-btn clear" data-act="clearQueue" data-arg="${slot}">清空</button>
      </span>
    </div>`;
  }

  private renderBagTabs(): void {
    this.els.bagTabs.innerHTML = `
      <button class="tab-btn${this.activeBagTab === "main" ? " sel" : ""}" data-act="bagTab" data-arg="main">主背包</button>
      <button class="tab-btn${this.activeBagTab === "warehouse" ? " sel" : ""}" data-act="bagTab" data-arg="warehouse">倉庫</button>
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
    const defs = RECIPES[slot].affixPool;
    const labelOf = (st: string) => defs.find((d) => d.stat === st)?.label ?? st;
    const entries = state.filters[slot] ?? [];
    const list = entries.length
      ? entries
          .map(
            (e, i) =>
              `<span class="fs-entry">${labelOf(e.stat)} ≥ T${e.minTier}
              <button class="fs-x" data-act="filterDel" data-arg="${slot}:${i}">✕</button></span>`,
          )
          .join("")
      : `<span class="fs-none">尚未設定條件</span>`;
    const opts = defs.map((d) => `<option value="${d.stat}">${d.label}</option>`).join("");
    const tiers = Array.from({ length: 8 }, (_, k) => `<option value="${k + 1}">T${k + 1} 以上</option>`).join("");

    this.filterModalEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${SLOT_NAME[slot]} 過濾器">
        <div class="modal-head">
          <h3>${SLOT_NAME[slot]} 過濾器</h3>
          <button class="modal-close" data-act="closeFilter">關閉</button>
        </div>
        <p class="hint">不符條件的新裝會自動進倉庫；空條件代表全留。</p>
        <div class="fs-list">${list}</div>
        <div class="fs-add">
          <select data-fstat="${slot}">${opts}</select>
          <select data-ftier="${slot}">${tiers}</select>
          <button class="fs-add-btn" data-act="filterAdd" data-arg="${slot}">新增條件</button>
        </div>
        <button class="btn-sweep" data-act="filterSweep">套用到現有背包</button>
      </div>
    `;
    this.filterModalEl.hidden = false;
  }

  private renderEquipInv(state: GameState): void {
    this.lastEquipLen = state.equipmentInv.length;
    this.els.equipInv.style.display = this.activeBagTab === "main" ? "" : "none";
    if (state.equipmentInv.length === 0) {
      this.els.equipInv.innerHTML = `<p class="empty-note">尚無裝備，去製裝吧。</p>`;
      return;
    }
    const head = `<div class="inv-head">
      <span>${state.equipmentInv.length} 件</span>
      <button class="ghost btn-discard-all" data-act="discardAll">全部拆除</button>
    </div>`;
    const items = state.equipmentInv
      .slice(0, INV_RENDER_CAP)
      .map(
        (eq) => `<div class="inv-item" data-uid="${eq.uid}" data-bag="main" data-eqtip="main:${eq.uid}">
        <span class="ii-name">${eq.icon} ${eq.name} <span class="ii-cnt">${eq.affixes.length}詞</span></span>
        <span class="ii-stats">${describeEquip(eq, state)}</span>
        <span class="ii-btns">
          <button data-act="equip" data-arg="${eq.uid}">裝備</button>
          <button class="ghost" data-act="toWare" data-arg="${eq.uid}">→庫</button>
          <button class="ghost" data-act="discard" data-arg="${eq.uid}">拆除</button>
        </span>
      </div>`,
      )
      .join("");
    const more = state.equipmentInv.length - INV_RENDER_CAP;
    const moreNote =
      more > 0 ? `<p class="empty-note">…還有 ${more} 件（已隱藏以維持效能）</p>` : "";
    this.els.equipInv.innerHTML = head + items + moreNote;
  }

  private renderResearch(): void {
    const tracks = allAffixDefs();
    this.els.research.innerHTML = `
      <div class="dism">
        <div class="dism-top">
          <span class="dism-title">${DISMANTLER.icon} 拆解機 <b class="mb-own" data-dcount></b></span>
          <span class="dism-status" data-dism-status></span>
        </div>
        <span class="cell-bar dism-bar"><i data-dism-bar></i></span>
        <div class="mc-btns">
          <button class="mc-step" data-act="dismActive" data-arg="-1">－</button>
          <button class="mc-step" data-act="dismActive" data-arg="1">＋</button>
          <button class="mc-craft" data-act="craftDismantler">製造 ${cost(DISMANTLER.buildCost)}</button>
        </div>
      </div>
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
      </div>
      <h3 class="research-sub">基底研究（拆解該槽裝備後自動累積，永久提升基底）</h3>
      <div class="branks">
        ${(["weapon", "armor", "accessory"] as Slot[])
          .map(
            (slot) => `<div class="brank" data-bslot="${slot}">
            <span class="rt-name">${SLOT_NAME[slot]}基底 <b class="rt-bonus" data-bbonus></b></span>
            <span class="rt-prog" data-bprog></span>
          </div>`,
          )
          .join("")}
      </div>`;
    this.dismCountEl = this.els.research.querySelector("[data-dcount]")!;
    this.dismCraftBtn = this.els.research.querySelector(".mc-craft")!;
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
        slot: row.dataset.bslot as Slot,
        bonus: row.querySelector<HTMLElement>("[data-bbonus]")!,
        prog: row.querySelector<HTMLElement>("[data-bprog]")!,
      });
    });
  }

  private renderWarehouse(state: GameState): void {
    this.lastWareLen = state.warehouseInv.length;
    this.els.warehouse.style.display = this.activeBagTab === "warehouse" ? "" : "none";
    if (state.warehouseInv.length === 0) {
      this.els.warehouse.innerHTML = `<p class="empty-note">倉庫是空的。</p>`;
      return;
    }
    const head = `<div class="inv-head">
      <span>${state.warehouseInv.length} 件</span>
      <button class="ghost btn-discard-all" data-act="discardAllWare">全部拆除</button>
    </div>`;
    const items = state.warehouseInv
      .slice(0, INV_RENDER_CAP)
      .map(
        (eq) => `<div class="inv-item" data-uid="${eq.uid}" data-bag="ware" data-eqtip="ware:${eq.uid}">
        <span class="ii-name">${eq.icon} ${eq.name} <span class="ii-cnt">${eq.affixes.length}詞</span></span>
        <span class="ii-stats">${describeEquip(eq, state)}</span>
        <span class="ii-btns">
          <button data-act="fromWare" data-arg="${eq.uid}">←取回</button>
          <button class="ghost" data-act="discard" data-arg="${eq.uid}">拆除</button>
        </span>
      </div>`,
      )
      .join("");
    const more = state.warehouseInv.length - INV_RENDER_CAP;
    const moreNote =
      more > 0 ? `<p class="empty-note">…還有 ${more} 件（已隱藏以維持效能）</p>` : "";
    this.els.warehouse.innerHTML = head + items + moreNote;
  }
}

// ---- ?澆?????----

/** ?券閰韌憿?嚗楊銝局?駁?嚗?靘?蝛嗉??”?具?*/
function allAffixDefs(): { stat: string; label: string }[] {
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
  return out;
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
): string {
  return [1, 10, 100]
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

function describeEquip(eq: Equipment, state: GameState): string {
  const summary = eq.slot === "weapon"
    ? getEquipmentSummaryRows(state, eq)
        .slice(0, 1)
        .map((row) => `${row.label} ${formatViewValue(row.value, row.pct)}`)
        .join("<br>")
    : "";
  // ?箏?嚗??箏??弦??嚗?1+baseBonus)嚗??????潸府銵??(+X%) 璅?
  const baseMult = 1 + baseBonus(state, eq.slot);
  const baseTag =
    baseMult > 1 ? ` <span class="aff-buff">(+${Math.round((baseMult - 1) * 100)}%)</span>` : "";
  const baseStr = Object.entries(eq.base)
    .map(([k, v]) => statLabel(k as keyof StatBlock, (v as number) * baseMult))
    .join(" ");
  const base = baseStr ? baseStr + baseTag : "";
  // 閰韌嚗??弦撘瑕漲???脤＊蝷箸摮??(1+strengthBonus)嚗?(+X%) 璅???靘??內??
  const aff = eq.affixes.map((a) => {
    const bonus = strengthBonus(state, a.stat);
    const buff = bonus > 0 ? ` <span class="aff-buff">(+${Math.round(bonus * 100)}%)</span>` : "";
    const eff = a.value * (1 + bonus);
    const val = a.pct ? Math.round(eff * 100) + "%" : fmtNum(eff);
    return `+${val} ${a.label} <span class="aff-tier">T${a.tier}</span>${buff}`;
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

function formatViewValue(value: number, pct: boolean): string {
  return pct ? `${Math.round(value * 100)}%` : fmtNum(value);
}

function statLabel(k: keyof StatBlock, v: number): string {
  const names: Record<keyof StatBlock, string> = {
    hp: "生命",
    atk: "點傷",
    localPhysPct: "本地物理",
    def: "防禦",
    critChance: "暴擊",
    critMult: "暴傷",
    haste: "攻速",
    hpRegen: "每秒回血",
    dmgReductionPct: "減傷",
    critDmgTakenReductionPct: "減暴傷承受",
  };
  const pctKeys: (keyof StatBlock)[] = [
    "localPhysPct",
    "critChance",
    "critMult",
    "haste",
    "dmgReductionPct",
    "critDmgTakenReductionPct",
  ];
  const val = pctKeys.includes(k) ? `${Math.round(v * 100)}%` : fmtNum(v);
  return `+${val} ${names[k]}`;
}

/** 撟喲?詨潭撘?嚗??其??亙?湔嚗＊蝷箔?敺?撣嗅??賊?嚗?*/
function fmtNum(n: number): string {
  return `${Math.round(n)}`;
}
