import type { AffixDef, Equipment, GameState, ItemRarity, Slot } from "./types.ts";
import { RECIPES } from "./content.ts";
import { rerollEquipment, augmentEquipment } from "./crafting.ts";

export const CRAFT_MIN_TIER = 1;
export const CRAFT_MAX_TIER = 7;

/** 附加可達到的詞綴數上限：普通／魔法最多 2 詞，稀有／傳奇最多 4 詞。
 *  （無詞普通附加一條會變魔法；魔法已 2 詞則無法再附加。） */
function augmentCap(rarity: ItemRarity): number {
  return rarity === "rare" || rarity === "legendary" ? 4 : 2;
}

export interface CraftStatus {
  ok: boolean;
  reason?: string;
}

/** 該基底能骰出的詞綴（工藝可指定的詞）。 */
export function craftableAffixDefs(slot: Slot): AffixDef[] {
  return RECIPES[slot]?.affixPool ?? [];
}

/** 指定階級的工藝精髓費用：T3＝100（拆解產出的 10 倍），每高一階 ×3（T1／T2 為 0，只需基本素材）。 */
export function craftEssenceCost(tier: number): number {
  return tier >= 3 ? 100 * 3 ** (tier - 3) : 0;
}

/** 工藝固定要付的基本素材（＝製作該裝備的成本）。 */
export function craftMaterialCost(slot: Slot): Record<string, number> {
  return RECIPES[slot]?.cost ?? {};
}

function affordStatus(state: GameState, slot: Slot, stat: string, tier: number): CraftStatus {
  const mat = craftMaterialCost(slot);
  for (const m in mat) {
    if ((state.inventory[m] ?? 0) < mat[m]) return { ok: false, reason: "基本素材不足" };
  }
  const ec = craftEssenceCost(tier);
  if (ec > 0 && (state.essences[stat] ?? 0) < ec) return { ok: false, reason: "精髓不足" };
  return { ok: true };
}

function spend(state: GameState, slot: Slot, stat: string, tier: number): void {
  const mat = craftMaterialCost(slot);
  for (const m in mat) state.inventory[m] = (state.inventory[m] ?? 0) - mat[m];
  const ec = craftEssenceCost(tier);
  if (ec > 0) state.essences[stat] = (state.essences[stat] ?? 0) - ec;
}

/** 重鑄狀態：限制只有基底（呼叫端已限定基底詞）＋材料／精髓。 */
export function rerollStatus(state: GameState, item: Equipment, stat: string, tier: number): CraftStatus {
  return affordStatus(state, item.slot, stat, tier);
}

/** 附加狀態：該詞已存在（自然詞）或無空詞位則不可用。 */
export function augmentStatus(state: GameState, item: Equipment, stat: string, tier: number): CraftStatus {
  if (item.affixes.some((a) => !a.fixed && !a.augmented && a.stat === stat)) return { ok: false, reason: "該詞綴已存在" };
  const naturalCount = item.affixes.filter((a) => !a.fixed && !a.augmented).length;
  if (naturalCount >= augmentCap(item.rarity)) return { ok: false, reason: "已達該稀有度詞綴上限" };
  return affordStatus(state, item.slot, stat, tier);
}

export function doReroll(state: GameState, item: Equipment, stat: string, tier: number): boolean {
  if (!rerollStatus(state, item, stat, tier).ok) return false;
  spend(state, item.slot, stat, tier);
  rerollEquipment(item, stat, tier);
  return true;
}

export function doAugment(state: GameState, item: Equipment, stat: string, tier: number): boolean {
  if (!augmentStatus(state, item, stat, tier).ok) return false;
  spend(state, item.slot, stat, tier);
  augmentEquipment(item, stat, tier);
  return true;
}
