import type { GameState, MachineState } from "./types.ts";
import { MACHINES } from "./content.ts";
import { spend, add, amount } from "./inventory.ts";
import { totalMachinePurchaseCost } from "./machineCosts.ts";

function ensure(state: GameState, id: string): MachineState {
  let m = state.machines[id];
  if (!m) {
    m = { count: 0, active: 0, progress: 0, idle: false };
    state.machines[id] = m;
  }
  return m;
}

/** 製造一台機台（花素材），總台數 +1 並預設運轉。成功回 true。 */
export function craftMachine(state: GameState, machineId: string): boolean {
  const def = MACHINES[machineId];
  if (!def) return false;
  const m = ensure(state, machineId);
  if (!spend(state, totalMachinePurchaseCost(def.buildCost, m.count, 1))) return false;
  m.count += 1;
  m.active += 1; // 新機台預設運轉
  return true;
}

/** 配置運轉台數（+/-）：機台不消失，只在運轉／閒置間切換（不退素材）。 */
export function setActive(state: GameState, machineId: string, delta: number): void {
  const m = state.machines[machineId];
  if (!m) return;
  m.active = Math.max(0, Math.min(m.count, m.active + delta));
}

/** 在 input 成本下，最多能跑幾輪（受庫存限制，上限 cap）。 */
function affordableRuns(
  state: GameState,
  input: Record<string, number>,
  cap: number,
): number {
  let runs = cap;
  for (const mat in input) {
    if (input[mat] <= 0) continue;
    runs = Math.min(runs, Math.floor(amount(state, mat) / input[mat]));
  }
  return Math.max(0, runs);
}

export function tickProduction(state: GameState, dt: number): void {
  for (const id in state.machines) {
    const m = state.machines[id];
    if (m.active <= 0) {
      m.progress = 0;
      m.idle = false;
      continue;
    }
    const def = MACHINES[id];
    if (!def) continue;

    // 生產速度 = 基礎速度 × 運轉台數：進度以運轉台數倍速前進
    m.progress += dt * m.active;
    if (m.progress < def.cycleTime) continue;

    const cycles = Math.floor(m.progress / def.cycleTime);
    const runs = affordableRuns(state, def.input, cycles);
    if (runs > 0) {
      const cost: Record<string, number> = {};
      for (const mat in def.input) cost[mat] = def.input[mat] * runs;
      spend(state, cost);
      for (const mat in def.output) add(state, mat, def.output[mat] * runs);
    }
    if (runs >= cycles) {
      m.progress -= def.cycleTime * runs; // 留下未滿一週期的零頭
      m.idle = false;
    } else {
      m.progress = def.cycleTime; // 素材不足：停在週期末等待
      m.idle = true;
    }
  }
}
