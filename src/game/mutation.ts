import type { Affix, AffixDef, AffixStat, Equipment, GameState, ItemRarity, Slot } from "./types.ts";
import { RECIPES } from "./content.ts";
import { rollTierValue } from "./machineCores.ts";
import { tierRange } from "./crafting.ts";
import { mutationPool, isMutationStat } from "./mutationAffixes.ts";

export const MUTAGEN = "mutagen";
/** 每次變異消耗的突變原（待平衡）。 */
export const MUTAGEN_PER_MUTATE = 1;
const MUTATION_HARD_CAP = 8;

/** 變異次數上限（全域）：未擊敗使徒＝0（鎖定）；首勝 3，每多勝 +1，封頂 8（min(8, 2+勝場)）。 */
export function mutationCap(state: GameState): number {
  const wins = state.progress.apostleWins ?? 0;
  return wins <= 0 ? 0 : Math.min(MUTATION_HARD_CAP, 2 + wins);
}
export function mutationUnlocked(state: GameState): boolean {
  return mutationCap(state) > 0;
}
export function remainingMutations(state: GameState, item: Equipment): number {
  return Math.max(0, mutationCap(state) - (item.mutationsUsed ?? 0));
}

/** 該稀有度的變異可挑詞位數（普通／魔法 2、稀有／傳奇 4；同 augmentCap）。 */
function slotPositions(rarity: ItemRarity): number {
  return rarity === "rare" || rarity === "legendary" ? 4 : 2;
}

function findDef(slot: Slot, stat: AffixStat): AffixDef | undefined {
  return (RECIPES[slot]?.affixPool ?? []).find((d) => d.stat === stat) ?? mutationPool(slot).find((d) => d.stat === stat);
}

function valueAtTier(def: AffixDef, tier: number, rng: () => number): { value: number; valueMax?: number } {
  const r = tierRange(def, tier);
  if (def.stat === "atk") return { value: r.min, valueMax: r.max };
  return { value: rollTierValue(r.min, r.max, !!def.pct, rng) };
}

function makeAffix(def: AffixDef, tier: number, rng: () => number): Affix {
  const v = valueAtTier(def, tier, rng);
  return { stat: def.stat, value: v.value, valueMax: v.valueMax, label: def.label, pct: def.pct, tier, tags: def.tags, fixed: def.fixed };
}

/** 首次被變異升降階時，快照「變異前」的階／值（供移除變異還原）。 */
function snapshot(aff: Affix): void {
  if (aff.mutation || aff.mutCreated || aff.preMut) return;
  aff.preMut = { tier: aff.tier, value: aff.value, valueMax: aff.valueMax };
}

export type MutationOutcome = "upgrade" | "downgrade" | "removed" | "grow" | "growVariant" | "wasted";
export interface MutationResult {
  outcome: MutationOutcome;
  stat?: AffixStat;
  tier?: number;
}

/** 對裝備做一次變異（呼叫端已確認可負擔）；就地修改、回傳結果供 UI。同時 +1 已用次數。 */
export function mutateEquipment(item: Equipment, rng: () => number = Math.random): MutationResult {
  const slot = item.slot;
  const positions = slotPositions(item.rarity);
  const pos = Math.floor(rng() * positions);
  const filled = item.affixes.length;
  const hasVariant = item.affixes.some((a) => a.mutation);

  const upgrade = (aff: Affix): MutationResult => {
    if (aff.mutation && aff.tier >= 2) return { outcome: "wasted" }; // 變異詞不破自身 2 階
    const def = findDef(slot, aff.stat);
    if (!def) return { outcome: "wasted" };
    snapshot(aff);
    const nt = aff.tier + 1;
    const v = valueAtTier(def, nt, rng);
    aff.tier = nt;
    aff.value = v.value;
    aff.valueMax = v.valueMax;
    return { outcome: "upgrade", stat: aff.stat, tier: nt };
  };
  const downgrade = (idx: number): MutationResult => {
    const aff = item.affixes[idx];
    const nt = aff.tier - 1;
    if (nt < 1) {
      item.affixes.splice(idx, 1);
      return { outcome: "removed", stat: aff.stat };
    }
    const def = findDef(slot, aff.stat);
    if (!def) return { outcome: "wasted" };
    snapshot(aff);
    const v = valueAtTier(def, nt, rng);
    aff.tier = nt;
    aff.value = v.value;
    aff.valueMax = v.valueMax;
    return { outcome: "downgrade", stat: aff.stat, tier: nt };
  };
  const growNormal = (): MutationResult => {
    const present = new Set(item.affixes.map((a) => a.stat));
    const pool = (RECIPES[slot]?.affixPool ?? []).filter((d) => !present.has(d.stat) && !isMutationStat(d.stat));
    if (pool.length === 0) return { outcome: "wasted" };
    const def = pool[Math.floor(rng() * pool.length)];
    const aff = makeAffix(def, 1, rng);
    aff.mutCreated = true;
    item.affixes.push(aff);
    return { outcome: "grow", stat: def.stat, tier: 1 };
  };
  const growVariant = (): MutationResult => {
    const pool = mutationPool(slot);
    if (pool.length === 0) return { outcome: "wasted" };
    const def = pool[Math.floor(rng() * pool.length)];
    const aff = makeAffix(def, 1, rng);
    aff.mutation = true;
    item.affixes.push(aff);
    return { outcome: "growVariant", stat: def.stat, tier: 1 };
  };

  let result: MutationResult;
  const r = rng();
  if (pos < filled) {
    // 已有詞的格：50/50 升／降
    result = r < 0.5 ? upgrade(item.affixes[pos]) : downgrade(pos);
  } else if (!hasVariant) {
    // 空格 ＆ 無變異詞：50% 升（長一般詞 T1）／50% 變異詞
    result = r < 0.5 ? growNormal() : growVariant();
  } else {
    // 空格但已有變異詞：20% 變異詞攤回升降 → 50% 升（長一般詞）／50% 浪費
    result = r < 0.5 ? growNormal() : { outcome: "wasted" };
  }
  item.mutationsUsed = (item.mutationsUsed ?? 0) + 1;
  return result;
}

/** 該詞是否帶變異影響（供移除變異 UI 判定）。 */
export function affixHasMutation(aff: Affix): boolean {
  return !!(aff.mutation || aff.mutCreated || aff.preMut);
}
export function itemHasMutation(item: Equipment): boolean {
  return item.affixes.some(affixHasMutation);
}

/** 移除指定詞位的變異影響：升降階還原到變異前；變異詞／mutCreated 整條移除。+1 已用次數。 */
export function removeMutationAt(item: Equipment, index: number): boolean {
  const aff = item.affixes[index];
  if (!aff || !affixHasMutation(aff)) return false;
  if (aff.mutation || aff.mutCreated) {
    item.affixes.splice(index, 1);
  } else if (aff.preMut) {
    aff.tier = aff.preMut.tier;
    aff.value = aff.preMut.value;
    aff.valueMax = aff.preMut.valueMax;
    delete aff.preMut;
  } else {
    return false;
  }
  item.mutationsUsed = (item.mutationsUsed ?? 0) + 1;
  return true;
}

export interface MutStatus {
  ok: boolean;
  reason?: string;
}
export function mutateStatus(state: GameState, item: Equipment): MutStatus {
  if (!mutationUnlocked(state)) return { ok: false, reason: "尚未解鎖（擊敗進化的使徒）" };
  if (remainingMutations(state, item) <= 0) return { ok: false, reason: "此裝備變異次數已用盡" };
  if ((state.inventory[MUTAGEN] ?? 0) < MUTAGEN_PER_MUTATE) return { ok: false, reason: "突變原不足" };
  return { ok: true };
}
export function removeMutationStatus(state: GameState, item: Equipment): MutStatus {
  if (!mutationUnlocked(state)) return { ok: false, reason: "尚未解鎖（擊敗進化的使徒）" };
  if (remainingMutations(state, item) <= 0) return { ok: false, reason: "此裝備變異次數已用盡" };
  if (!itemHasMutation(item)) return { ok: false, reason: "無可移除的變異" };
  return { ok: true };
}

export function doMutate(state: GameState, item: Equipment): MutationResult | null {
  if (!mutateStatus(state, item).ok) return null;
  state.inventory[MUTAGEN] = (state.inventory[MUTAGEN] ?? 0) - MUTAGEN_PER_MUTATE;
  return mutateEquipment(item);
}
export function doRemoveMutation(state: GameState, item: Equipment, index: number): boolean {
  if (!removeMutationStatus(state, item).ok) return false;
  return removeMutationAt(item, index);
}

/** 已裝備的變異詞對戰鬥的彙總效果（hero.ts／combat.ts 取用）。 */
export function mutationCombatEffects(state: GameState): {
  doubleStrikeChance: number;
  critHealPct: number;
  lowHpRegenMult: number;
  maxHpPct: number;
} {
  let doubleStrikeChance = 0;
  let critHealPct = 0;
  let lowHpRegenMult = 0;
  let maxHpPct = 0;
  const items = [state.equipped.weapon, state.equipped.armor, state.equipped.accessory[0], state.equipped.accessory[1]];
  for (const item of items) {
    if (!item) continue;
    for (const a of item.affixes) {
      if (a.stat === "mutDoubleStrike") doubleStrikeChance += a.value;
      else if (a.stat === "mutCritHeal") critHealPct += a.value;
      else if (a.stat === "mutLowHpRegen") lowHpRegenMult += a.value;
      else if (a.stat === "mutMaxHpPct") maxHpPct += a.value;
    }
  }
  return { doubleStrikeChance, critHealPct, lowHpRegenMult, maxHpPct };
}
