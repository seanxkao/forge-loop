import type { CoreItem, FilterCmp, FilterEntry, GameState, Item, ItemSlot } from "./types.ts";
import { countVariableAffixes } from "./itemAffixes.ts";
import { simulateCraftedItem } from "./craftingEstimate.ts";

const RARITY_RANK = {
  normal: 0,
  magic: 1,
  rare: 2,
  legendary: 3,
} as const;

function cmpOk(value: number, target: number, cmp: FilterCmp): boolean {
  return cmp === "lte" ? value <= target : value >= target;
}

/** 以一組過濾條件（AND）判定某道具是否符合。支援「至少／至多」。 */
export function passesFilterEntries(entries: FilterEntry[], item: Item): boolean {
  for (const entry of entries) {
    let ok: boolean;
    if (entry.kind === "affixTier") {
      ok = entry.stat === "__any__"
        ? item.affixes.some((affix) => !affix.fixed && cmpOk(affix.tier, entry.tier, entry.cmp))
        : item.affixes.some((affix) => !affix.fixed && affix.stat === entry.stat && cmpOk(affix.tier, entry.tier, entry.cmp));
    } else if (entry.kind === "variableAffixes") {
      ok = cmpOk(countVariableAffixes(item), entry.count, entry.cmp);
    } else {
      ok = cmpOk(RARITY_RANK[item.rarity], RARITY_RANK[entry.rarity], entry.cmp);
    }
    if (!ok) return false;
  }
  return true;
}

/** 整理主背包：依各類型的背包過濾器，把不符的道具收進倉庫（空規則＝全留）。 */
export function organizeBag(state: GameState): void {
  for (let i = state.equipmentInv.length - 1; i >= 0; i -= 1) {
    const item = state.equipmentInv[i];
    if (item.locked) continue;
    const entries = state.bagFilters[item.slot] ?? [];
    if (entries.length === 0) continue;
    if (!passesFilterEntries(entries, item)) {
      state.warehouseInv.push(state.equipmentInv.splice(i, 1)[0]);
    }
  }
}

/** 估算「平均每製作幾件，能得到 1 件符合」。以該行核心效果重骰取樣。 */
export function estimateFilterAverageCrafts(
  state: GameState,
  slot: ItemSlot,
  cores: ReadonlyArray<CoreItem | null>,
  entries: FilterEntry[],
  samples = 20000,
): number | null {
  if (samples <= 0 || entries.length === 0) return null;
  let matches = 0;
  for (let i = 0; i < samples; i += 1) {
    if (passesFilterEntries(entries, simulateCraftedItem(state, slot, cores))) matches += 1;
  }
  if (matches <= 0) return null;
  return samples / matches;
}
