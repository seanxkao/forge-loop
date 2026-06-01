import type { ItemRarity, ItemKind } from "./types.ts";

const MAGIC_UPGRADE_CHANCE = 0.5;
const RARE_UPGRADE_CHANCE = 0.25;
const MAGIC_TWO_AFFIX_CHANCE = 0.5;
const RARE_THREE_AFFIX_CHANCE = 1 / 3;

function upgradedChance(base: number, rarityBonus: number): number {
  return Math.min(1, base * (1 + Math.max(0, rarityBonus)));
}

export function rollEquipmentRarity(rarityBonus: number, rng: () => number = Math.random): ItemRarity {
  if (rng() >= upgradedChance(MAGIC_UPGRADE_CHANCE, rarityBonus)) return "normal";
  if (rng() < upgradedChance(RARE_UPGRADE_CHANCE, rarityBonus)) return "rare";
  return "magic";
}

export function rollCoreRarity(rarityBonus: number, rng: () => number = Math.random): ItemRarity {
  return rng() < upgradedChance(MAGIC_UPGRADE_CHANCE, rarityBonus) ? "magic" : "normal";
}

export function rollEquipmentAffixCount(rarity: ItemRarity, rng: () => number = Math.random): number {
  switch (rarity) {
    case "normal":
      return 0;
    case "magic":
      return rng() < MAGIC_TWO_AFFIX_CHANCE ? 1 : 2;
    case "rare":
    case "legendary":
      return rng() < RARE_THREE_AFFIX_CHANCE ? 3 : 4;
  }
}

export function rollCoreVariableAffixCount(rarity: ItemRarity, rng: () => number = Math.random): number {
  if (rarity === "normal") return 0;
  return rng() < MAGIC_TWO_AFFIX_CHANCE ? 1 : 2;
}

export function deriveLegacyItemRarity(kind: ItemKind, affixCount: number): ItemRarity {
  if (kind === "core") return affixCount <= 1 ? "normal" : "magic";
  if (affixCount <= 0) return "normal";
  if (affixCount <= 2) return "magic";
  return "rare";
}

export function rarityClassName(rarity: ItemRarity): string {
  return rarity === "normal" ? "" : `rarity-${rarity}`;
}
