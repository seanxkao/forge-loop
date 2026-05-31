import type { GameState, Item } from "./types.ts";

/** 裝備是否通過該槽的過濾條件：每列要求的屬性都存在且品質階 ≥ 門檻（AND）。 */
export function passesFilter(state: GameState, item: Item): boolean {
  const entries = state.filters[item.slot] ?? [];
  for (const e of entries) {
    const ok = e.stat === "__any__"
      ? item.affixes.some((a) => a.tier >= e.minTier)
      : item.affixes.some((a) => a.stat === e.stat && a.tier >= e.minTier);
    if (!ok) return false;
  }
  return true;
}

/** 把主背包中不符過濾條件的裝備一次掃進倉庫。 */
export function applyFilterSweep(state: GameState): void {
  for (let i = state.equipmentInv.length - 1; i >= 0; i--) {
    if (!passesFilter(state, state.equipmentInv[i])) {
      state.warehouseInv.push(state.equipmentInv.splice(i, 1)[0]);
    }
  }
}
