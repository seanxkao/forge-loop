import type { Affix, BaseResearchSlot, GameState, Item } from "./types.ts";
import { baseBonus, strengthBonus } from "./research.ts";

export function countVariableAffixes(item: Pick<Item, "affixes">): number {
  return item.affixes.filter((affix) => !affix.fixed).length;
}

export function affixBonusMultiplier(state: GameState, item: Pick<Item, "kind" | "slot" | "rarity">, affix: Pick<Affix, "stat" | "fixed">): number {
  if ("rarity" in item && item.rarity === "legendary") return 1;
  if (affix.fixed) {
    const slot: BaseResearchSlot = item.kind === "core" ? "core" : item.slot;
    return 1 + baseBonus(state, slot);
  }
  return 1 + strengthBonus(state, affix.stat);
}
