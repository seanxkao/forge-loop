import type { Equipment, GameState, Item } from "./types.ts";
import { RECIPES, CORE_RECIPE } from "./content.ts";
import { add } from "./inventory.ts";
import { unsocketCore } from "./machineCores.ts";

export function equip(state: GameState, uid: number): void {
  const idx = state.equipmentInv.findIndex((item) => item.uid === uid && item.kind === "equipment");
  if (idx < 0) return;
  const eq = state.equipmentInv[idx] as Equipment;
  state.equipmentInv.splice(idx, 1);
  const prev = state.equipped[eq.slot];
  if (prev) state.equipmentInv.push(prev);
  state.equipped[eq.slot] = eq;
}

export function unequip(state: GameState, slot: Equipment["slot"]): void {
  const eq = state.equipped[slot];
  if (!eq) return;
  state.equipped[slot] = null;
  state.equipmentInv.push(eq);
}

function removeFromBags(state: GameState, uid: number): Item | null {
  for (const bag of [state.equipmentInv, state.warehouseInv]) {
    const idx = bag.findIndex((item) => item.uid === uid);
    if (idx >= 0) return bag.splice(idx, 1)[0];
  }
  return null;
}

function refundCost(state: GameState, cost: Record<string, number>): void {
  for (const mat in cost) {
    const exact = cost[mat] * 0.25;
    let back = Math.floor(exact);
    if (Math.random() < exact - back) back += 1;
    if (back > 0) add(state, mat, back);
  }
}

export function discard(state: GameState, uid: number): void {
  const item = removeFromBags(state, uid);
  if (!item) return;
  if (item.kind === "equipment") {
    const recipe = RECIPES[item.recipeId];
    if (recipe) refundCost(state, recipe.cost);
  } else {
    refundCost(state, CORE_RECIPE.cost);
  }
}

export function toWarehouse(state: GameState, uid: number): void {
  const idx = state.equipmentInv.findIndex((item) => item.uid === uid);
  if (idx < 0) return;
  state.warehouseInv.push(state.equipmentInv.splice(idx, 1)[0]);
}

export function fromWarehouse(state: GameState, uid: number): void {
  const idx = state.warehouseInv.findIndex((item) => item.uid === uid);
  if (idx < 0) return;
  state.equipmentInv.push(state.warehouseInv.splice(idx, 1)[0]);
}

export function unsocketAllCoresIntoInventory(state: GameState): void {
  for (const id of Object.keys(state.machines)) {
    unsocketCore(state, { kind: "machine", id }, 0);
    unsocketCore(state, { kind: "machine", id }, 1);
  }
  for (const slot of Object.keys(state.crafters) as Array<keyof typeof state.crafters>) {
    unsocketCore(state, { kind: "crafter", id: slot }, 0);
    unsocketCore(state, { kind: "crafter", id: slot }, 1);
  }
  unsocketCore(state, { kind: "coreCrafter", id: CORE_RECIPE.id }, 0);
  unsocketCore(state, { kind: "coreCrafter", id: CORE_RECIPE.id }, 1);
  unsocketCore(state, { kind: "dismantler", id: "dismantler" }, 0);
  unsocketCore(state, { kind: "dismantler", id: "dismantler" }, 1);
}
