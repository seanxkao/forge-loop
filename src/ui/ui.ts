import type { GameState, StatBlock, Equipment, Slot } from "../game/types.ts";
import { MATERIALS, STAGES, MACHINES, RECIPES, DISMANTLER } from "../game/content.ts";
import { deriveStats, attackInterval } from "../game/hero.ts";
import { canAfford } from "../game/inventory.ts";
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
  onCraftMachine(id: string): void;
  onSetActive(id: string, delta: number): void;
  onCraft(recipeId: string, qty: number): void;
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

/** 雙層更新：
 *  - refresh()：使用者操作後重建含按鈕的面板，並快取動態節點。
 *  - tick()：每幀只原地更新數值/樣式（不替換節點，避免 hover 閃爍與 click 遺失）。
 */
export class UI {
  private activeTab: string | null = null;
  private drawerEl!: HTMLElement;
  private panelEls: Record<string, HTMLElement> = {};
  private tabBtnEls: Record<string, HTMLElement> = {};

  private els!: {
    stages: HTMLElement;
    hero: HTMLElement;
    equipped: HTMLElement;
    machines: HTMLElement;
    crafting: HTMLElement;
    filters: HTMLElement;
    equipInv: HTMLElement;
    warehouse: HTMLElement;
    inventory: HTMLElement;
    research: HTMLElement;
  };

  // 研究分頁 tick() 用快取
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
    btn: HTMLElement;
  }[] = [];
  private researchDisp: Record<string, number> = {}; // easing 用的顯示值
  private lastStages: Record<string, number> = {}; // 偵測達標
  private flashUntil: Record<string, number> = {}; // 閃爍到期時間（performance.now）

  // tick() 用的快取節點
  private machineCards: {
    id: string;
    countEl: HTMLElement;
    bar: HTMLElement;
    craftBtn: HTMLElement;
    cardEl: HTMLElement;
  }[] = [];
  private craftBtns: { id: string; el: HTMLElement }[] = [];
  private heroVals: Record<string, HTMLElement> = {};
  private matVals: Record<string, HTMLElement> = {};
  private matEls: Record<string, HTMLElement> = {};
  private lastWareLen = -1; // 偵測倉庫被拆解器消耗的變動

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
            <p class="hint">「製造」增加機台（花素材）、「－」拆除退回素材；機台越多、生產越快。</p>
            <div class="machines" data-zone="machines"></div>
          </section>
          <section class="panel-section" data-panel="bag">
            <h2>製裝</h2>
            <div class="crafting" data-zone="crafting"></div>
            <div class="collapse-box">
              <div class="collapse-head" data-act="toggleFilters">
                <span data-filter-caret>▼</span> 過濾器
              </div>
              <div class="collapse-body" data-filter-body>
                <p class="hint">不符條件的新裝會自動進倉庫；空條件＝全留。</p>
                <div class="filters" data-zone="filters"></div>
                <button class="btn-sweep" data-act="filterSweep">套用到現有背包</button>
              </div>
            </div>
            <h2>裝備庫存</h2>
            <p class="hint">右鍵裝備可一鍵在背包／倉庫間互轉。</p>
            <div class="equip-inv" data-zone="equipInv"></div>
            <h2>倉庫</h2>
            <div class="warehouse" data-zone="warehouse"></div>
          </section>
          <section class="panel-section" data-panel="research">
            <h2>研究</h2>
            <p class="hint">啟動拆解器會自動銷毀倉庫裝備；T3 以上的詞綴轉成該類研究值，每階永久 +5% 該類詞綴強度（下階成本翻倍）。</p>
            <div class="research" data-zone="research"></div>
          </section>
        </aside>
      </div>
    `;
    this.root.querySelector(".canvas-wrap")!.appendChild(this.canvas);
    const z = (n: string) =>
      this.root.querySelector(`[data-zone="${n}"]`) as HTMLElement;
    this.els = {
      stages: z("stages"),
      hero: z("hero"),
      equipped: z("equipped"),
      machines: z("machines"),
      crafting: z("crafting"),
      filters: z("filters"),
      equipInv: z("equipInv"),
      warehouse: z("warehouse"),
      inventory: z("inventory"),
      research: z("research"),
    };
    // 抽屜與分頁鈕參照
    this.drawerEl = this.root.querySelector("[data-drawer]") as HTMLElement;
    this.panelEls = {};
    this.root
      .querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((el) => (this.panelEls[el.dataset.panel!] = el));
    this.tabBtnEls = {};
    this.root
      .querySelectorAll<HTMLElement>(".tab-btn")
      .forEach((el) => (this.tabBtnEls[el.dataset.arg!] = el));
    // 結構靜態、永不重建的面板只建一次
    this.buildHero();
    this.buildInventory();
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("contextmenu", (e) => this.onContextMenu(e));
  }

  private filterCollapsed = false;

  /** 收合／展開過濾器區。 */
  private toggleFilters(): void {
    this.filterCollapsed = !this.filterCollapsed;
    const body = this.root.querySelector("[data-filter-body]") as HTMLElement | null;
    const caret = this.root.querySelector("[data-filter-caret]") as HTMLElement | null;
    if (body) body.style.display = this.filterCollapsed ? "none" : "";
    if (caret) caret.textContent = this.filterCollapsed ? "▶" : "▼";
  }

  /** 切換側分頁抽屜：再點同一頁則收起。 */
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

  /** 右鍵裝備：一鍵在主背包／倉庫間互轉。 */
  private onContextMenu(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest("[data-uid]") as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    const uid = Number(t.dataset.uid);
    if (t.dataset.bag === "ware") this.cb.onFromWarehouse(uid);
    else this.cb.onToWarehouse(uid);
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
    if (!t) return;
    const act = t.dataset.act!;
    const arg = t.dataset.arg ?? "";
    switch (act) {
      case "reset":
        this.cb.onReset();
        break;
      case "tab":
        this.setTab(arg);
        break;
      case "stage":
        this.cb.onSelectStage(arg);
        break;
      case "craftMachine":
        this.cb.onCraftMachine(arg);
        break;
      case "machineActive":
        this.cb.onSetActive(arg, Number(t.dataset.delta ?? "0"));
        break;
      case "craft":
        this.cb.onCraft(arg, Number(t.dataset.qty ?? "1"));
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
      case "filterAdd": {
        const stat = (
          this.els.filters.querySelector(
            `[data-fstat="${arg}"]`,
          ) as HTMLSelectElement
        ).value;
        const tier = Number(
          (
            this.els.filters.querySelector(
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
      case "toggleFilters":
        this.toggleFilters();
        break;
    }
  }

  /** 使用者操作後呼叫：重建含按鈕的面板、重新快取，並跑一次 live 更新。 */
  refresh(state: GameState): void {
    this.renderStages(state);
    this.renderEquipped(state);
    this.renderMachines(state);
    this.renderCrafting();
    this.renderFilters(state);
    this.renderEquipInv(state);
    this.renderWarehouse(state);
    this.renderResearch();
    this.tick(state);
  }

  /** 每幀呼叫：只原地更新數值與樣式，不替換任何節點。 */
  tick(state: GameState): void {
    const s = deriveStats(state);
    // 英雄屬性
    const setHV = (k: string, v: string) => {
      const el = this.heroVals[k];
      if (el) el.textContent = v;
    };
    setHV("hp", `${Math.ceil(Math.max(0, state.combat.heroHp))} / ${s.hp}`);
    setHV("atk", `${Math.round(s.atk)}`);
    setHV("def", `${s.def}`);
    setHV("spd", `${attackInterval(s).toFixed(2)}s`);
    setHV("crit", `${Math.round(s.critChance * 100)}%`);
    setHV("critm", `${Math.round(s.critMult * 100)}%`);
    setHV("regen", `${Math.round(s.hpRegen)}/s`);
    setHV("dr", `${Math.round(s.dmgReductionPct * 100)}%`);
    setHV("cdr", `${Math.round(s.critDmgTakenReductionPct * 100)}%`);

    // 素材數量
    for (const id in this.matVals) {
      const n = state.inventory[id] ?? 0;
      this.matVals[id].textContent = `${n}`;
      this.matEls[id].classList.toggle("dim", n === 0);
    }

    // 機台卡片：運轉/總數、進度條、缺料、製造按鈕買得起與否
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
    // 製裝：買得起與否
    for (const c of this.craftBtns) {
      c.el.classList.toggle("poor", !canAfford(state, RECIPES[c.id].cost));
    }

    // 研究：拆解機與各研究軌（運轉時每幀變動）
    const dm = state.dismantler;
    this.dismCountEl.textContent = `${dm.active}/${dm.count}`;
    this.dismBar.style.width =
      dm.active > 0 ? `${Math.round((dm.progress / DISMANTLE_CYCLE) * 100)}%` : "0%";
    this.dismCraftBtn.classList.toggle("poor", !canAfford(state, DISMANTLER.buildCost));
    const dcount = dismantleableCount(state);
    this.dismStatus.textContent = dcount
      ? `可拆 ${dcount} 件（含 T3+ 詞綴）`
      : "無可拆裝備（需 T3+ 詞綴）";
    const now = performance.now();
    for (const t of this.researchRows) {
      const stages = state.research.stages[t.stat] ?? 0;
      const pts = state.research.points[t.stat] ?? 0;
      const cost = stageCost(stages);
      if (this.lastStages[t.stat] === undefined) this.lastStages[t.stat] = stages;
      // 達標：先把進度條衝滿、觸發閃爍，再 ease 回落到新階零頭
      if (stages !== this.lastStages[t.stat]) {
        this.researchDisp[t.stat] = stageCost(this.lastStages[t.stat]);
        this.lastStages[t.stat] = stages;
        this.flashUntil[t.stat] = now + 700;
      }
      const prev = this.researchDisp[t.stat] ?? pts;
      const disp = prev + (pts - prev) * 0.18; // easing
      this.researchDisp[t.stat] = disp;
      t.bonus.textContent = `+${stages * 5}%`;
      t.prog.textContent = `${Math.floor(disp)}/${cost}`;
      t.fill.style.width = `${Math.round(Math.min(1, disp / cost) * 100)}%`;
      t.row.classList.toggle("flash", (this.flashUntil[t.stat] ?? 0) > now);
    }
    // 基底研究：加成%、可消耗/所需件數、按鈕可否
    for (const b of this.baseRows) {
      const stages = state.baseResearch[b.slot] ?? 0;
      const need = baseStageCost(stages);
      const avail = baseItemsAvailable(state, b.slot);
      b.bonus.textContent = `+${Math.round(baseBonus(state, b.slot) * 100)}%`;
      b.prog.textContent = `${avail}/${need} 件`;
      b.btn.classList.toggle("poor", avail < need);
    }

    // 倉庫被拆解器即時消耗 → 數量變動時才重建清單
    if (state.warehouseInv.length !== this.lastWareLen) this.renderWarehouse(state);
  }

  // ---- 只建一次的靜態面板 ----

  private buildHero(): void {
    this.els.hero.innerHTML = `
      <div class="stat-grid">
        <span>❤️ 生命</span><b data-hv="hp"></b>
        <span>⚔️ 攻擊</span><b data-hv="atk"></b>
        <span>🛡️ 防禦</span><b data-hv="def"></b>
        <span>⏱️ 攻速</span><b data-hv="spd"></b>
        <span>🎯 暴擊</span><b data-hv="crit"></b>
        <span>💥 暴傷</span><b data-hv="critm"></b>
        <span>💚 回血</span><b data-hv="regen"></b>
        <span>🪨 減傷</span><b data-hv="dr"></b>
        <span>🛡️ 減暴傷</span><b data-hv="cdr"></b>
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

  // ---- 操作後才重建的面板 ----

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
          return `<div class="eq-slot empty"><span class="slot-tag">${SLOT_NAME[slot]}</span>—</div>`;
        }
        return `<div class="eq-slot"><span class="slot-tag">${SLOT_NAME[slot]}</span>
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
        return `<div class="machine-card" data-mid="${m.id}">
          <div class="mc-top">
            <span class="mb-icon">${m.icon}</span>
            <span class="mb-name">${m.name} <span class="mb-own" data-mcount>${active}/${total}</span></span>
          </div>
          <span class="mb-recipe">${cost(m.input)} → ${cost(m.output)} / ${m.cycleTime}s</span>
          <span class="cell-bar mc-bar"><i data-mbar></i></span>
          <div class="mc-btns">
            <button class="mc-step" data-act="machineActive" data-arg="${m.id}" data-delta="-1">－</button>
            <button class="mc-step" data-act="machineActive" data-arg="${m.id}" data-delta="1">＋</button>
            <button class="mc-craft" data-act="craftMachine" data-arg="${m.id}">製造 ${cost(m.buildCost)}</button>
          </div>
        </div>`;
      })
      .join("");
    this.machineCards = [];
    this.els.machines
      .querySelectorAll<HTMLElement>("[data-mid]")
      .forEach((card) =>
        this.machineCards.push({
          id: card.dataset.mid!,
          countEl: card.querySelector<HTMLElement>("[data-mcount]")!,
          bar: card.querySelector<HTMLElement>("[data-mbar]")!,
          craftBtn: card.querySelector<HTMLElement>(".mc-craft")!,
          cardEl: card,
        }),
      );
  }

  private renderCrafting(): void {
    this.els.crafting.innerHTML = Object.values(RECIPES)
      .map(
        (r) => `<div class="craft-row" data-craft="${r.id}">
          <span class="cb-name">${r.icon} ${r.name}</span>
          <span class="cb-base">${describeStats(r.base)}</span>
          <span class="cb-cost">${cost(r.cost)}</span>
          <span class="cb-acts">
            <button class="craft-btn" data-act="craft" data-arg="${r.id}" data-qty="1">製作</button>
            <button class="craft-btn x10" data-act="craft" data-arg="${r.id}" data-qty="10">×10</button>
            <button class="craft-btn x10" data-act="craft" data-arg="${r.id}" data-qty="100">×100</button>
          </span>
        </div>`,
      )
      .join("");
    // tick() 用：以整列為單位標示買不起（兩顆按鈕同步變暗）
    this.craftBtns = [];
    this.els.crafting
      .querySelectorAll<HTMLElement>(".craft-row")
      .forEach((el) => this.craftBtns.push({ id: el.dataset.craft!, el }));
  }

  private renderEquipInv(state: GameState): void {
    if (state.equipmentInv.length === 0) {
      this.els.equipInv.innerHTML = `<p class="empty-note">尚無裝備，去製裝吧。</p>`;
      return;
    }
    const head = `<div class="inv-head">
      <span>${state.equipmentInv.length} 件</span>
      <button class="ghost btn-discard-all" data-act="discardAll">全部拆除</button>
    </div>`;
    const items = state.equipmentInv
      .map(
        (eq) => `<div class="inv-item" data-uid="${eq.uid}" data-bag="main">
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
    this.els.equipInv.innerHTML = head + items;
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
      <h3 class="research-sub">基底研究（消耗該槽裝備，永久提升基底）</h3>
      <div class="branks">
        ${(["weapon", "armor", "accessory"] as Slot[])
          .map(
            (slot) => `<div class="brank" data-bslot="${slot}">
            <span class="rt-name">${SLOT_NAME[slot]}基底 <b class="rt-bonus" data-bbonus></b></span>
            <span class="rt-prog" data-bprog></span>
            <button class="mc-craft" data-act="researchBase" data-arg="${slot}">研究</button>
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
        btn: row.querySelector<HTMLElement>(".mc-craft")!,
      });
    });
  }

  private renderFilters(state: GameState): void {
    const slots: Slot[] = ["weapon", "armor", "accessory"];
    this.els.filters.innerHTML = slots
      .map((slot) => {
        const defs = RECIPES[slot].affixPool;
        const labelOf = (st: string) =>
          defs.find((d) => d.stat === st)?.label ?? st;
        const entries = state.filters[slot] ?? [];
        const list = entries.length
          ? entries
              .map(
                (e, i) =>
                  `<span class="fs-entry">${labelOf(e.stat)} ≥T${e.minTier}
                  <button class="fs-x" data-act="filterDel" data-arg="${slot}:${i}">✕</button></span>`,
              )
              .join("")
          : `<span class="fs-none">無條件（全留）</span>`;
        const opts = defs
          .map((d) => `<option value="${d.stat}">${d.label}</option>`)
          .join("");
        const tiers = Array.from(
          { length: 8 },
          (_, k) => `<option value="${k + 1}">≥T${k + 1}</option>`,
        ).join("");
        return `<div class="filter-slot">
          <div class="fs-head">${SLOT_NAME[slot]}</div>
          <div class="fs-list">${list}</div>
          <div class="fs-add">
            <select data-fstat="${slot}">${opts}</select>
            <select data-ftier="${slot}">${tiers}</select>
            <button class="fs-add-btn" data-act="filterAdd" data-arg="${slot}">＋條件</button>
          </div>
        </div>`;
      })
      .join("");
  }

  private renderWarehouse(state: GameState): void {
    this.lastWareLen = state.warehouseInv.length;
    if (state.warehouseInv.length === 0) {
      this.els.warehouse.innerHTML = `<p class="empty-note">倉庫是空的。</p>`;
      return;
    }
    const head = `<div class="inv-head">
      <span>${state.warehouseInv.length} 件</span>
      <button class="ghost btn-discard-all" data-act="discardAllWare">全部拆除</button>
    </div>`;
    this.els.warehouse.innerHTML =
      head +
      state.warehouseInv
        .map(
        (eq) => `<div class="inv-item" data-uid="${eq.uid}" data-bag="ware">
        <span class="ii-name">${eq.icon} ${eq.name} <span class="ii-cnt">${eq.affixes.length}詞</span></span>
        <span class="ii-stats">${describeEquip(eq, state)}</span>
        <span class="ii-btns">
          <button data-act="fromWare" data-arg="${eq.uid}">←取回</button>
          <button class="ghost" data-act="discard" data-arg="${eq.uid}">拆除</button>
        </span>
      </div>`,
      )
      .join("");
  }
}

// ---- 格式化輔助 ----

/** 全部詞綴類型（跨三槽去重），供研究軌列表用。 */
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

function describeStats(s: Partial<StatBlock>): string {
  return Object.entries(s)
    .map(([k, v]) => statLabel(k as keyof StatBlock, v as number))
    .join(" ");
}

function describeEquip(eq: Equipment, state: GameState): string {
  const base = describeStats(eq.base);
  const aff = eq.affixes.map((a) => {
    const bonus = strengthBonus(state, a.stat);
    const buff = bonus > 0 ? ` <span class="aff-buff">(+${Math.round(bonus * 100)}%)</span>` : "";
    const val = a.pct ? Math.round(a.value * 100) + "%" : a.value;
    return `+${val} ${a.label} <span class="aff-tier">T${a.tier}</span>${buff}`;
  });
  return [base, ...aff].filter(Boolean).join("<br>");
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
  const val = pctKeys.includes(k) ? `${Math.round(v * 100)}%` : `${v}`;
  return `+${val} ${names[k]}`;
}
