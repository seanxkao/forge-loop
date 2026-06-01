import type { EquipSlotId, Equipment, GameState, Item } from "./types.ts";
import { RECIPES, CORE_RECIPE } from "./content.ts";
import { add } from "./inventory.ts";
import { unsocketCore } from "./machineCores.ts";

export function equippedItems(state: GameState): Equipment[] {
  return [
    state.equipped.weapon,
    state.equipped.armor,
    ...state.equipped.accessory,
  ].filter((item): item is Equipment => item !== null);
}

export function equippedItemInSlot(state: GameState, slot: EquipSlotId): Equipment | null {
  if (slot === "weapon") return state.equipped.weapon;
  if (slot === "armor") return state.equipped.armor;
  return state.equipped.accessory[slot === "accessory1" ? 0 : 1];
}

export function equip(state: GameState, uid: number): void {
  const idx = state.equipmentInv.findIndex((item) => item.uid === uid && item.kind === "equipment");
  if (idx < 0) return;
  const eq = state.equipmentInv[idx] as Equipment;
  state.equipmentInv.splice(idx, 1);

  if (eq.slot === "accessory") {
    const emptyIndex = state.equipped.accessory.findIndex((item) => item === null);
    if (emptyIndex >= 0) {
      state.equipped.accessory[emptyIndex] = eq;
      return;
    }
    const prev = state.equipped.accessory[0];
    if (prev) state.equipmentInv.push(prev);
    state.equipped.accessory[0] = eq;
    return;
  }

  const prev = state.equipped[eq.slot];
  if (prev) state.equipmentInv.push(prev);
  state.equipped[eq.slot] = eq;
}

export function unequip(state: GameState, slot: EquipSlotId): void {
  if (slot === "accessory1" || slot === "accessory2") {
    const index = slot === "accessory1" ? 0 : 1;
    const eq = state.equipped.accessory[index];
    if (!eq) return;
    state.equipped.accessory[index] = null;
    state.equipmentInv.push(eq);
    return;
  }
  const eq = state.equipped[slot];
  if (!eq) return;
  state.equipped[slot] = null;
  state.equipmentInv.push(eq);
}

function removeFromBags(state: GameState, uid: number): Item | null {
  for (const bag of [state.equipmentInv, state.warehouseInv]) {
    const idx = bag.findIndex((item) => item.uid === uid);
    if (idx >= 0) {
      if (bag[idx].locked) return null;
      return bag.splice(idx, 1)[0];
    }
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
  for (const tab of state.production.tabs) {
    for (const row of tab.rows) {
      unsocketCore(state, row.cores, 0);
      unsocketCore(state, row.cores, 1);
    }
  }
  unsocketCore(state, state.lab.cores, 0);
  unsocketCore(state, state.lab.cores, 1);
}

export function toggleItemLock(state: GameState, uid: number): void {
  for (const bag of [state.equipmentInv, state.warehouseInv]) {
    const item = bag.find((entry) => entry.uid === uid);
    if (item) {
      item.locked = !item.locked;
      return;
    }
  }
}
