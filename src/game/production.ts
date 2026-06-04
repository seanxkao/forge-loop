import type { GameState, ProductionRow, RecipeId } from "./types.ts";
import { PROD_RECIPES, RECIPES, type ProdRecipeDef } from "./content.ts";
import { spend, add, amount } from "./inventory.ts";
import { machineCoreEffects, type MachineCoreEffects } from "./machineCores.ts";
import { emitEquipment, emitCore } from "./crafting.ts";
import { isRecipeUnlocked } from "./unlocks.ts";

export function activeMachineCountByRecipe(state: GameState, recipe: RecipeId): number {
  let total = 0;
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) {
      if (row.recipe !== recipe || row.count <= 0 || row.paused || row.idle) continue;
      if (row.auto === false && (row.queue ?? 0) <= 0) continue;
      total += row.count;
    }
  }
  return total;
}

export function hasCatalystRecipeMaterial(state: GameState, recipe: RecipeId): boolean {
  if (recipe !== "stable_mutagen") return true;
  return amount(state, "biosteel") > 0;
}

function newRow(recipe: RecipeId): ProductionRow {
  return { recipe, count: 1, paused: false, auto: true, queue: 0, machineStep: 1, orderStep: 1, progress: 0, productivity: 0, idle: false, reserved: {}, cores: [null, null], filter: [] };
}

function rowAt(state: GameState, tabIndex: number, rowIndex: number): ProductionRow | null {
  return state.production.tabs[tabIndex]?.rows[rowIndex] ?? null;
}

/** 把某行已預留的原料退回庫存並清空緩衝。 */
function refundReserved(state: GameState, row: ProductionRow): void {
  if (!row.reserved) return;
  for (const mat in row.reserved) {
    if (row.reserved[mat] > 0) add(state, mat, row.reserved[mat]);
  }
  row.reserved = {};
}

// ---- 行 / 分頁操作 ----

/** 在某分頁放置一台組裝機並指定配方（消耗 1 台庫存組裝機）。成功回 true。 */
export function placeMachine(state: GameState, tabIndex: number, recipe: RecipeId): boolean {
  if (state.spareAssemblers <= 0) return false;
  const tab = state.production.tabs[tabIndex];
  if (!tab) return false;
  state.spareAssemblers -= 1;
  tab.rows.push(newRow(recipe));
  state.progress.placedFirstMachine = true;
  return true;
}

/** 在某行增加 1 台組裝機（消耗 1 台庫存）。成功回 true。 */
export function addMachineToRow(state: GameState, tabIndex: number, rowIndex: number): boolean {
  if (state.spareAssemblers <= 0) return false;
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return false;
  state.spareAssemblers -= 1;
  row.count += 1;
  return true;
}

/** 從某行減少機器（退回庫存）。最少保留 1 台（要整行收回請用 ✕）。 */
export function removeMachineFromRow(state: GameState, tabIndex: number, rowIndex: number, qty: number): void {
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return;
  const dec = Math.min(qty, row.count - 1);
  if (dec <= 0) return;
  row.count -= dec;
  state.spareAssemblers += dec;
}

/** 收回整行：台數退回庫存、已插核心退回主背包、刪除該行。 */
export function removeRow(state: GameState, tabIndex: number, rowIndex: number): void {
  const tab = state.production.tabs[tabIndex];
  const row = tab?.rows[rowIndex];
  if (!tab || !row) return;
  refundReserved(state, row);
  state.spareAssemblers += row.count;
  for (const core of row.cores) if (core) state.equipmentInv.push(core);
  tab.rows.splice(rowIndex, 1);
}

/** 變更某行配方（退回舊配方預留料，重置進度／產能；保留台數與核心）。 */
export function setRowRecipe(state: GameState, tabIndex: number, rowIndex: number, recipe: RecipeId): void {
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return;
  refundReserved(state, row);
  row.recipe = recipe;
  row.progress = 0;
  row.productivity = 0;
  row.idle = false;
}

/** 切換某行運轉／暫停。 */
export function toggleRowPaused(state: GameState, tabIndex: number, rowIndex: number): void {
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return;
  row.paused = !row.paused;
  if (row.paused) {
    row.progress = 0;
    row.idle = false;
  }
}

/** 切換某行「自動製造／手動下單」。 */
export function toggleRowAuto(state: GameState, tabIndex: number, rowIndex: number): void {
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return;
  row.auto = row.auto === false ? true : false;
}

/** 手動模式下單：訂單佇列 +qty。 */
export function enqueueOrder(state: GameState, tabIndex: number, rowIndex: number, qty: number): void {
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return;
  row.queue = Math.max(0, (row.queue ?? 0) + qty);
}

/** 調整某行的數量步進（kind：machine／order；up：×10 否則 ÷10）。十的冪次，範圍 1..1,000,000。 */
export function adjustRowStep(state: GameState, tabIndex: number, rowIndex: number, kind: "machine" | "order", up: boolean): void {
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return;
  const key = kind === "order" ? "orderStep" : "machineStep";
  const cur = row[key] ?? 1;
  row[key] = up ? Math.min(cur * 10, 1_000_000) : Math.max(1, Math.round(cur / 10));
}

/** 清空某行訂單佇列（並退回已為該訂單預留的原料）。 */
export function clearOrder(state: GameState, tabIndex: number, rowIndex: number): void {
  const row = rowAt(state, tabIndex, rowIndex);
  if (!row) return;
  row.queue = 0;
  refundReserved(state, row);
}

export function addProductionTab(state: GameState): void {
  state.production.tabs.push({ name: `分頁 ${state.production.tabs.length + 1}`, rows: [] });
}

export function renameProductionTab(state: GameState, tabIndex: number, name: string): void {
  const tab = state.production.tabs[tabIndex];
  if (tab) tab.name = name.trim() || tab.name;
}

/** 刪除分頁：該頁所有機器與核心退回；至少保留一個分頁。 */
export function removeProductionTab(state: GameState, tabIndex: number): void {
  const tab = state.production.tabs[tabIndex];
  if (!tab) return;
  for (const row of tab.rows) {
    refundReserved(state, row);
    state.spareAssemblers += row.count;
    for (const core of row.cores) if (core) state.equipmentInv.push(core);
  }
  state.production.tabs.splice(tabIndex, 1);
  if (state.production.tabs.length === 0) state.production.tabs.push({ name: "生產線", rows: [] });
}

// ---- tick ----

/** 該行 reserved 緩衝目前夠跑幾次（受最缺的輸入限制）。 */
function bufferedRuns(row: ProductionRow, def: ProdRecipeDef): number {
  let runs = Infinity;
  for (const mat in def.input) {
    if (def.input[mat] <= 0) continue;
    runs = Math.min(runs, Math.floor((row.reserved[mat] ?? 0) / def.input[mat]));
  }
  return Number.isFinite(runs) ? Math.max(0, runs) : 0;
}

/** 發料起點游標：每 tick 往後輪替一格，避免稀缺原料永遠落在清單前段的行。 */
let distributeCursor = 0;

/** 公平發料（逐項分配）：對「每一種原料」各自輪流發給需要它的行，每行該項最多存
 *  台數 × 該項一次量。多輸入的配方（如組裝機 ore+hide+shard）可分項累積，不必三種同時湊齊，
 *  避免被單輸入線把各原料壓在門檻下而永遠缺料。每 tick 起點輪替，避免前段偏袒。 */
function distributeMaterials(state: GameState): void {
  const list: { row: ProductionRow; def: ProdRecipeDef }[] = [];
  const materials = new Set<string>();
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) {
      if (!row.reserved) row.reserved = {};
      if (!row.recipe || row.count <= 0 || row.paused) continue;
      if (row.auto === false && (row.queue ?? 0) <= 0) continue; // 手動且無訂單 → 不預留料
      const def = PROD_RECIPES[row.recipe];
      if (!def || !isRecipeUnlocked(state, row.recipe)) continue;
      list.push({ row, def });
      for (const mat in def.input) materials.add(mat);
    }
  }
  const n = list.length;
  if (n === 0) return;
  const start = ((distributeCursor % n) + n) % n;
  for (const mat of materials) {
    let moved = true;
    while (moved) {
      moved = false;
      for (let k = 0; k < n; k += 1) {
        const { row, def } = list[(start + k) % n];
        const perRun = def.input[mat] ?? 0;
        if (perRun <= 0) continue;
        // 每行此原料上限 = 台數 × 該項一次量；每輪最多補一次量，但可只拿到目前有的量（部分累積）。
        const room = perRun * row.count - (row.reserved[mat] ?? 0);
        if (room <= 0) continue;
        const give = Math.min(perRun, room, amount(state, mat));
        if (give <= 0) continue;
        spend(state, { [mat]: give });
        row.reserved[mat] = (row.reserved[mat] ?? 0) + give;
        moved = true;
      }
    }
  }
  distributeCursor = (start + 1) % n; // 下一 tick 換下一條線優先
}

/** 依配方種類產出 runs 份（不扣料；扣料在 tickRow 統一處理）。 */
function produceOutputs(
  state: GameState,
  row: ProductionRow,
  def: ProdRecipeDef,
  effects: MachineCoreEffects,
  runs: number,
): void {
  switch (def.kind) {
    case "refine":
      if (def.output) for (const mat in def.output) add(state, mat, def.output[mat] * runs);
      break;
    case "equipment": {
      const recipe = RECIPES[def.slot as string];
      for (let i = 0; i < runs; i += 1) emitEquipment(state, recipe, effects, row.filter);
      break;
    }
    case "core":
      for (let i = 0; i < runs; i += 1) emitCore(state, effects, row.filter);
      break;
    case "assembler":
      state.spareAssemblers += runs;
      break;
    case "lab":
      state.lab.count += runs;
      break;
    case "dismantler":
      state.dismantler.count += runs;
      break;
    case "trialCatalyst":
      if (def.output) for (const mat in def.output) add(state, mat, def.output[mat] * runs);
      break;
    case "trialHeal":
      break;
    case "trialDamage":
      break;
  }
}

function tickRow(state: GameState, row: ProductionRow, dt: number): void {
  if (!row.reserved) row.reserved = {};
  if (!row.recipe || row.count <= 0 || row.paused) {
    row.progress = 0;
    row.idle = false;
    return;
  }
  const def = PROD_RECIPES[row.recipe];
  if (!def || !isRecipeUnlocked(state, row.recipe)) {
    row.progress = 0;
    row.idle = false;
    return;
  }
  // 手動模式且無訂單 → 不生產、退回已預留的料、閒置。
  const manual = row.auto === false;
  if (manual && (row.queue ?? 0) <= 0) {
    refundReserved(state, row);
    row.progress = 0;
    row.idle = false;
    return;
  }
  const effects = machineCoreEffects(state, row.cores);
  if (!hasCatalystRecipeMaterial(state, row.recipe)) {
    row.idle = true;
    return;
  }
  // 緩衝不足一次運轉量 → 等補料（不前進進度）。
  if (bufferedRuns(row, def) < 1) {
    row.idle = true;
    return;
  }
  row.progress += dt * row.count * (1 + effects.machineSpeedPct);
  if (row.progress < def.cycleTime) {
    row.idle = false;
    return;
  }

  const cycles = Math.floor(row.progress / def.cycleTime);
  // 手動模式下，最多做到訂單剩餘數。
  const runs = Math.min(cycles, bufferedRuns(row, def), manual ? (row.queue ?? 0) : Infinity);
  if (runs <= 0) {
    row.progress = def.cycleTime;
    row.idle = true;
    return;
  }

  // 只從自己的預留緩衝扣料（不直接搶庫存）。
  for (const mat in def.input) {
    const used = def.input[mat] * runs;
    row.reserved[mat] = (row.reserved[mat] ?? 0) - used;
    if (effects.materialRefundPct > 0) {
      const refund = Math.round(used * effects.materialRefundPct);
      if (refund > 0) add(state, mat, refund);
    }
  }
  produceOutputs(state, row, def, effects, runs);
  if (manual) row.queue = Math.max(0, (row.queue ?? 0) - runs);

  // 產能條：滿 100% 額外產出 1 份（獨立重骰、不耗料、不回灌）。
  row.productivity += runs * effects.productivity;
  while (row.productivity >= 1) {
    row.productivity -= 1;
    if (def.kind === "trialCatalyst") add(state, "mutagen", 1);
    else produceOutputs(state, row, def, effects, 1);
  }

  if (runs >= cycles) {
    row.progress -= def.cycleTime * runs;
    row.idle = false;
  } else {
    row.progress = def.cycleTime; // 緩衝中途用盡：停在週期末等補料
    row.idle = true;
  }
}

export function tickProduction(state: GameState, dt: number): void {
  distributeMaterials(state); // 先公平補料，再各行用自己的緩衝生產
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) tickRow(state, row, dt);
  }
}
