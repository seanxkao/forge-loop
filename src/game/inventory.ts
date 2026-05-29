import type { GameState } from "./types.ts";

export function amount(state: GameState, mat: string): number {
  return state.inventory[mat] ?? 0;
}

export function add(state: GameState, mat: string, qty: number): void {
  state.inventory[mat] = amount(state, mat) + qty;
}

/** 是否買得起一組成本。 */
export function canAfford(
  state: GameState,
  cost: Record<string, number>,
): boolean {
  for (const mat in cost) {
    if (amount(state, mat) < cost[mat]) return false;
  }
  return true;
}

/** 扣除一組成本；成功回 true，不足回 false（不扣）。 */
export function spend(
  state: GameState,
  cost: Record<string, number>,
): boolean {
  if (!canAfford(state, cost)) return false;
  for (const mat in cost) {
    state.inventory[mat] = amount(state, mat) - cost[mat];
  }
  return true;
}
