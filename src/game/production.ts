import type { GameState, MachineState } from "./types.ts";
import { MACHINES } from "./content.ts";
import { spend, add, amount } from "./inventory.ts";
import { totalMachinePurchaseCost } from "./machineCosts.ts";
import { machineCoreEffects } from "./machineCores.ts";
import { activeAfterCountIncrease, nextActiveCount } from "./machineToggle.ts";

function ensure(state: GameState, id: string): MachineState {
  let m = state.machines[id];
  if (!m) {
    m = { count: 0, active: 0, progress: 0, productivity: 0, idle: false, cores: [null, null] };
    state.machines[id] = m;
  }
  return m;
}

export function craftMachine(state: GameState, machineId: string): boolean {
  const def = MACHINES[machineId];
  if (!def) return false;
  const m = ensure(state, machineId);
  if (!spend(state, totalMachinePurchaseCost(def.buildCost, m.count, 1))) return false;
  m.count += 1;
  m.active = activeAfterCountIncrease(m.active, m.count);
  return true;
}

export function toggleMachineActive(state: GameState, machineId: string): void {
  const m = state.machines[machineId];
  if (!m) return;
  m.active = nextActiveCount(m.active, m.count);
}

function affordableRuns(state: GameState, input: Record<string, number>, cap: number): number {
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
    const effects = machineCoreEffects(state, { kind: "machine", id });

    m.progress += dt * m.active * (1 + effects.machineSpeedPct);
    if (m.progress < def.cycleTime) continue;

    const cycles = Math.floor(m.progress / def.cycleTime);
    const runs = affordableRuns(state, def.input, cycles);
    if (runs > 0) {
      const inputCost: Record<string, number> = {};
      for (const mat in def.input) inputCost[mat] = def.input[mat] * runs;
      spend(state, inputCost);
      if (effects.materialRefundPct > 0) {
        for (const [mat, value] of Object.entries(inputCost)) {
          const refund = Math.round(value * effects.materialRefundPct);
          if (refund > 0) add(state, mat, refund);
        }
      }
      for (const mat in def.output) add(state, mat, def.output[mat] * runs);
      m.productivity += runs * effects.productivity;
      while (m.productivity >= 1) {
        m.productivity -= 1;
        for (const mat in def.output) add(state, mat, def.output[mat]);
      }
    }
    if (runs >= cycles) {
      m.progress -= def.cycleTime * runs;
      m.idle = false;
    } else {
      m.progress = def.cycleTime;
      m.idle = true;
    }
  }
}
