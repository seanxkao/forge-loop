import type { GameState, Equipment } from "./types.ts";
import { RECIPES } from "./content.ts";
import { add } from "./inventory.ts";

/** 裝備一件（同槽已有則換下放回庫存）。 */
export function equip(state: GameState, uid: number): void {
  const idx = state.equipmentInv.findIndex((e) => e.uid === uid);
  if (idx < 0) return;
  const eq = state.equipmentInv[idx];
  state.equipmentInv.splice(idx, 1);
  const prev = state.equipped[eq.slot];
  if (prev) state.equipmentInv.push(prev);
  state.equipped[eq.slot] = eq;
}

/** 卸下某槽位裝備放回庫存。 */
export function unequip(state: GameState, slot: Equipment["slot"]): void {
  const eq = state.equipped[slot];
  if (!eq) return;
  state.equipped[slot] = null;
  state.equipmentInv.push(eq);
}

/** 從主背包或倉庫移除指定裝備，回傳該裝備（找不到回 null）。 */
function removeFromBags(state: GameState, uid: number): Equipment | null {
  for (const bag of [state.equipmentInv, state.warehouseInv]) {
    const idx = bag.findIndex((e) => e.uid === uid);
    if (idx >= 0) return bag.splice(idx, 1)[0];
  }
  return null;
}

/** 拆除一件裝備（主背包或倉庫皆可），退還該配方 25% 素材（小數以機率進位）。 */
export function discard(state: GameState, uid: number): void {
  const eq = removeFromBags(state, uid);
  if (!eq) return;
  const recipe = RECIPES[eq.recipeId];
  if (recipe) {
    for (const mat in recipe.cost) {
      const exact = recipe.cost[mat] * 0.25;
      let back = Math.floor(exact);
      if (Math.random() < exact - back) back += 1; // 小數部分以機率進位
      if (back > 0) add(state, mat, back);
    }
  }
}

/** 主背包 → 倉庫。 */
export function toWarehouse(state: GameState, uid: number): void {
  const idx = state.equipmentInv.findIndex((e) => e.uid === uid);
  if (idx < 0) return;
  state.warehouseInv.push(state.equipmentInv.splice(idx, 1)[0]);
}

/** 倉庫 → 主背包。 */
export function fromWarehouse(state: GameState, uid: number): void {
  const idx = state.warehouseInv.findIndex((e) => e.uid === uid);
  if (idx < 0) return;
  state.equipmentInv.push(state.warehouseInv.splice(idx, 1)[0]);
}
