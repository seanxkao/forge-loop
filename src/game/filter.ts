import type { GameState, Item } from "./types.ts";
import { countVariableAffixes } from "./itemAffixes.ts";

const RARITY_RANK = {
  normal: 0,
  magic: 1,
  rare: 2,
} as const;

export function passesFilter(state: GameState, item: Item): boolean {
  const entries = state.filters[item.slot] ?? [];
  for (const entry of entries) {
    const ok = entry.kind === "affixTier"
      ? (
        entry.stat === "__any__"
          ? item.affixes.some((affix) => !affix.fixed && affix.tier >= entry.minTier)
          : item.affixes.some(
            (affix) => !affix.fixed && affix.stat === entry.stat && affix.tier >= entry.minTier,
          )
      )
      : entry.kind === "minVariableAffixes"
      ? countVariableAffixes(item) >= entry.count
      : RARITY_RANK[item.rarity] >= RARITY_RANK[entry.rarity];
    if (!ok) return false;
  }
  return true;
}

export function applyFilterSweep(state: GameState): void {
  for (let i = state.equipmentInv.length - 1; i >= 0; i--) {
    if (!passesFilter(state, state.equipmentInv[i])) {
      state.warehouseInv.push(state.equipmentInv.splice(i, 1)[0]);
    }
  }
}
