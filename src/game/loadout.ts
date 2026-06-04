import type { EquipSlotId, GameState, LoadoutAction, RuneId } from "./types.ts";
import { equip, unequip, equipIntoSlot } from "./equipment.ts";
import { RUNE_DEFS } from "./runes.ts";

/** 是否處於戰鬥中：有存活敵人、非結算暫停、非通關待續。
 *  戰鬥中更改裝備／符文要延後到下場戰鬥；非戰鬥中（如關卡結算空檔）則立即套用。 */
export function inBattle(state: GameState): boolean {
  return state.combat.enemyHp > 0 && state.combat.clearPause <= 0 && !state.reincarnation.victoryPending;
}

/** 取得背包中某 uid 裝備的槽位（weapon／armor／accessory），找不到回 null。 */
function equipSlotOf(state: GameState, uid: number): string | null {
  const item = state.equipmentInv.find((i) => i.uid === uid);
  return item && item.kind === "equipment" ? item.slot : null;
}

/** 把一個換裝／符文動作排入待辦：
 *  - 裝備：依槽位分開排隊——武器／防具各保留一個（覆蓋同槽）；飾品有兩槽，最多保留兩個（超過丟最舊）。
 *  - 卸下：可預排多個槽；再點同一槽＝取消該槽的預排卸下（toggle）。
 *  - 符文：只保留最後一次。 */
export function queueLoadoutAction(state: GameState, action: LoadoutAction): void {
  if (action.kind === "equip") {
    const itemSlot = equipSlotOf(state, action.uid);
    let pend = state.pendingLoadout.filter((a) => !(a.kind === "equip" && a.uid === action.uid));
    let target: EquipSlotId;
    if (itemSlot === "weapon" || itemSlot === "armor") {
      target = itemSlot;
      pend = pend.filter((a) => !(a.kind === "equip" && a.slot === target)); // 覆蓋同槽既有待穿
    } else {
      // 飾品：目標槽於排入當下決定並固定（之後卸下別槽不重算）
      const accEquips = pend.filter((a): a is { kind: "equip"; uid: number; slot?: EquipSlotId } =>
        a.kind === "equip" && (a.slot === "accessory1" || a.slot === "accessory2"));
      if (accEquips.length >= 2) {
        const oldest = accEquips[0]; // 已滿兩格，取代最舊
        pend = pend.filter((a) => a !== oldest);
        target = oldest.slot!;
      } else if (accEquips.length === 1) {
        target = accEquips[0].slot === "accessory1" ? "accessory2" : "accessory1"; // 補另一格
      } else {
        const free1 = !state.equipped.accessory[0] || pend.some((a) => a.kind === "unequip" && a.slot === "accessory1");
        const free2 = !state.equipped.accessory[1] || pend.some((a) => a.kind === "unequip" && a.slot === "accessory2");
        target = free1 ? "accessory1" : free2 ? "accessory2" : "accessory1"; // 優先空槽，否則取代飾品 1
      }
    }
    pend.push({ kind: "equip", uid: action.uid, slot: target });
    state.pendingLoadout = pend;
  } else if (action.kind === "unequip") {
    const had = state.pendingLoadout.some((a) => a.kind === "unequip" && a.slot === action.slot);
    state.pendingLoadout = state.pendingLoadout.filter((a) => !(a.kind === "unequip" && a.slot === action.slot));
    if (!had) state.pendingLoadout.push(action);
  } else {
    state.pendingLoadout = state.pendingLoadout.filter((a) => a.kind !== "rune");
    state.pendingLoadout.push(action);
  }
}

/** 下場戰鬥開始時呼叫：固定順序套用——先全部卸下、再依解析的目標槽穿上、再符文，最後清空。
 *  穿上用 equipIntoSlot 精準放入解析槽，確保兩件飾品分別進入兩個槽（與 UI 預排顯示一致）。 */
export function applyPendingLoadout(state: GameState): void {
  if (!state.pendingLoadout.length) return;
  const { slotByUid } = resolvePendingSlots(state);
  const actions = state.pendingLoadout;
  for (const a of actions) if (a.kind === "unequip") unequip(state, a.slot);
  for (const a of actions) {
    if (a.kind !== "equip") continue;
    const slot = slotByUid.get(a.uid);
    if (slot) equipIntoSlot(state, a.uid, slot);
    else equip(state, a.uid);
  }
  for (const a of actions) {
    if (a.kind === "rune") state.runes.selected = a.ids.filter((id) => id in RUNE_DEFS && state.runes.owned.includes(id));
  }
  state.pendingLoadout = [];
}

/** UI：待裝備的道具 uid 集合。 */
export function pendingEquipUids(state: GameState): Set<number> {
  const set = new Set<number>();
  for (const a of state.pendingLoadout) if (a.kind === "equip") set.add(a.uid);
  return set;
}

/** UI：待卸下的槽位集合。 */
export function pendingUnequipSlots(state: GameState): Set<EquipSlotId> {
  const set = new Set<EquipSlotId>();
  for (const a of state.pendingLoadout) if (a.kind === "unequip") set.add(a.slot);
  return set;
}

/** 某 uid 是否為待穿裝備（待穿期間禁止刪除／移倉／整理清除）。 */
export function isPendingEquip(state: GameState, uid: number): boolean {
  return state.pendingLoadout.some((a) => a.kind === "equip" && a.uid === uid);
}

/** 解析每個待穿裝備實際會進入的槽位（模擬「先卸後穿、equip 取第一個空槽」），
 *  並回報哪些「原本有真實裝備」的槽會被待穿裝備取代（derived 卸下）。 */
export function resolvePendingSlots(state: GameState): {
  slotByUid: Map<number, EquipSlotId>;
  displaced: Set<EquipSlotId>;
} {
  const slotByUid = new Map<number, EquipSlotId>();
  const displaced = new Set<EquipSlotId>();
  const realOcc: Record<EquipSlotId, boolean> = {
    weapon: !!state.equipped.weapon,
    armor: !!state.equipped.armor,
    accessory1: !!state.equipped.accessory[0],
    accessory2: !!state.equipped.accessory[1],
  };
  const explicitUneq = new Set<EquipSlotId>();
  for (const a of state.pendingLoadout) if (a.kind === "unequip") explicitUneq.add(a.slot);
  for (const a of state.pendingLoadout) {
    if (a.kind !== "equip") continue;
    // 目標槽在排入時已固定（a.slot）；舊資料無 slot 時退而用物品類型推一個
    let slot = a.slot;
    if (!slot) {
      const t = equipSlotOf(state, a.uid);
      slot = t === "weapon" || t === "armor" ? t : "accessory1";
    }
    slotByUid.set(a.uid, slot);
    // 該槽原有真實裝備、且未被明確卸下 → 會被取代（derived 卸下）
    if (realOcc[slot] && !explicitUneq.has(slot)) displaced.add(slot);
  }
  return { slotByUid, displaced };
}

/** UI：下場會被空出的槽位＝明確預排卸下 ∪ 被待穿裝備取代的槽。 */
export function pendingVacatedSlots(state: GameState): Set<EquipSlotId> {
  const set = new Set<EquipSlotId>(resolvePendingSlots(state).displaced);
  for (const a of state.pendingLoadout) if (a.kind === "unequip") set.add(a.slot);
  return set;
}

/** 取消某待穿裝備：移除該 equip，並連動移除其目標槽的明確卸下預排。 */
export function cancelPendingEquip(state: GameState, uid: number): void {
  const slot = resolvePendingSlots(state).slotByUid.get(uid);
  state.pendingLoadout = state.pendingLoadout.filter(
    (a) => !(a.kind === "equip" && a.uid === uid) && !(slot != null && a.kind === "unequip" && a.slot === slot),
  );
}

/** 取消某槽位的卸下預排：移除該槽明確卸下，並連動移除「會進入該槽」的待穿裝備。 */
export function cancelPendingVacate(state: GameState, slot: EquipSlotId): void {
  const { slotByUid } = resolvePendingSlots(state);
  state.pendingLoadout = state.pendingLoadout.filter((a) => {
    if (a.kind === "unequip" && a.slot === slot) return false;
    if (a.kind === "equip" && slotByUid.get(a.uid) === slot) return false;
    return true;
  });
}

/** UI：「顯示用」符文選擇——有待辦時為待辦的最後值，否則為當前生效值。 */
export function effectiveRuneSelection(state: GameState): { pending: boolean; ids: RuneId[] } {
  let pending = false;
  let ids: RuneId[] = state.runes.selected;
  for (const a of state.pendingLoadout) {
    if (a.kind === "rune") { pending = true; ids = a.ids; }
  }
  return { pending, ids };
}
