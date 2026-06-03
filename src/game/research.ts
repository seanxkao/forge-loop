import type { BaseResearchSlot, GameState, Affix, Item } from "./types.ts";
import { researchStageGrowthFactor } from "./reincarnation.ts";
import { machineCoreEffects } from "./machineCores.ts";
import { affixLabel } from "./affixMeta.ts";

const BASE_STAGE_BASE_COST = 5;
const BASE_STRENGTH_PER_STAGE = 0.2;

/** 基底研究升一階所需結晶數（沿用舊「件數」曲線：5、×成長…）。 */
export function baseStageCost(state: GameState, stages: number): number {
  return Math.max(1, Math.round(BASE_STAGE_BASE_COST * researchStageGrowthFactor(state) ** stages));
}

export function baseBonus(state: GameState, slot: BaseResearchSlot): number {
  return BASE_STRENGTH_PER_STAGE * (state.baseResearch[slot] ?? 0);
}

/** 該槽目前持有的結晶數（基底研究通貨）。 */
export function baseItemsAvailable(state: GameState, slot: BaseResearchSlot): number {
  return state.crystals[slot] ?? 0;
}

/** 瞬間升一階基底研究：足夠結晶才扣除並升階。回傳是否成功（供升階閃光）。 */
export function researchBase(state: GameState, slot: BaseResearchSlot): boolean {
  const stages = state.baseResearch[slot] ?? 0;
  const cost = baseStageCost(state, stages);
  if ((state.crystals[slot] ?? 0) < cost) return false;
  state.crystals[slot] -= cost;
  state.baseResearch[slot] = stages + 1;
  return true;
}

const STAGE_BASE_COST = 50;
const STRENGTH_PER_STAGE = 0.1;
export const DISMANTLE_CYCLE = 2;

/** 詞綴研究升一階所需精髓數（沿用舊研究值曲線：50、×成長…）。 */
export function stageCost(state: GameState, stages: number): number {
  return Math.max(1, Math.round(STAGE_BASE_COST * researchStageGrowthFactor(state) ** stages));
}

/** 一條 T3 以上詞綴拆出的精髓量：T3＝10，每高一階 ×2（T1／T2 不產）。 */
export function affixResearchValue(aff: Affix): number {
  return aff.tier >= 3 ? 10 * 2 ** (aff.tier - 3) : 0;
}

export function strengthBonus(state: GameState, stat: string): number {
  return STRENGTH_PER_STAGE * (state.research.stages[stat] ?? 0);
}

/** 該 stat 目前持有的精髓數（詞綴研究通貨）。 */
export function essenceAvailable(state: GameState, stat: string): number {
  return state.essences[stat] ?? 0;
}

/** 瞬間升一階詞綴研究：足夠精髓才扣除並升階。回傳是否成功（供升階閃光）。 */
export function researchAffix(state: GameState, stat: string): boolean {
  const stages = state.research.stages[stat] ?? 0;
  const cost = stageCost(state, stages);
  if ((state.essences[stat] ?? 0) < cost) return false;
  state.essences[stat] -= cost;
  state.research.stages[stat] = stages + 1;
  return true;
}

/** 倉庫中可被拆解的裝備數（未鎖、非傳奇）。 */
export function dismantleableCount(state: GameState): number {
  return state.warehouseInv.filter((item) => !item.locked && item.rarity !== "legendary").length;
}

/** 拆一件裝備 → 產出對應精髓（每條 T3+ 詞綴）與結晶（該槽 +1）。不消耗額外資源。 */
function dismantleToCurrency(state: GameState, item: Item): void {
  if (item.rarity === "legendary") return;
  const slot: BaseResearchSlot = item.kind === "core" ? "core" : item.slot;
  state.crystals[slot] = (state.crystals[slot] ?? 0) + 1;
  for (const aff of item.affixes) {
    if (aff.fixed) continue;
    const v = affixResearchValue(aff);
    if (v > 0) state.essences[aff.stat] = (state.essences[aff.stat] ?? 0) + v;
  }
}

function hasDismantleable(state: GameState): boolean {
  return state.warehouseInv.some((item) => !item.locked && item.rarity !== "legendary");
}

/** 拆解機 tick：運轉時每週期從倉庫取一件可拆裝備 → 精髓／結晶。
 *  速度 = 基礎 × 台數；核心「產能」累積達 1 → 對當下這件免費再拆一次（不消耗裝備）；
 *  「退還原料」對拆解機無效。 */
export function tickDismantler(state: GameState, dt: number): void {
  const d = state.dismantler;
  if (d.count <= 0 || !hasDismantleable(state)) {
    d.progress = 0;
    return;
  }
  d.progress += dt * d.count;
  if (d.progress < DISMANTLE_CYCLE) return;

  const effects = machineCoreEffects(state, d.cores);
  while (d.progress >= DISMANTLE_CYCLE && hasDismantleable(state)) {
    const index = state.warehouseInv.findIndex((item) => !item.locked && item.rarity !== "legendary");
    if (index < 0) break;
    const item = state.warehouseInv.splice(index, 1)[0] as Item;
    dismantleToCurrency(state, item); // 消耗本件
    d.productivity += effects.productivity;
    while (d.productivity >= 1) {
      dismantleToCurrency(state, item); // 產能免費再拆（不消耗）
      d.productivity -= 1;
    }
    d.progress -= DISMANTLE_CYCLE;
  }

  if (!hasDismantleable(state)) d.progress = 0;
}

export interface TrialChange {
  label: string;
  from: number;
  to: number;
}
export interface TrialResult {
  changes: TrialChange[];
  refunded: boolean;
  capped: boolean;
}

/** 試煉研究加成層數上限。 */
export const TRIAL_RESEARCH_LAYER_CAP = 5;

const BASE_RESEARCH_LABEL: Record<BaseResearchSlot, string> = {
  weapon: "武器基底",
  armor: "防具基底",
  accessory: "飾品基底",
  core: "核心基底",
};

/** 達 level 等所需的累積資源（各階成本和），用指定成長率。 */
function totalSpend(level: number, baseCost: number, growth: number): number {
  let sum = 0;
  for (let i = 0; i < level; i += 1) sum += Math.max(1, Math.round(baseCost * growth ** i));
  return sum;
}
/** 以 budget 在指定成長率下能升到幾等，並回傳剩餘。 */
function relevel(budget: number, baseCost: number, growth: number): { level: number; leftover: number } {
  let level = 0;
  let remaining = budget;
  for (;;) {
    const cost = Math.max(1, Math.round(baseCost * growth ** level));
    if (remaining < cost) break;
    remaining -= cost;
    level += 1;
  }
  return { level, leftover: remaining };
}

/** 試煉通關：+1 層輪迴研究折扣後，把「已達等級耗用的資源」按新（較低）成本重算等級，
 *  升到不能再升，剩餘退還為對應精髓／結晶。回傳各研究的等級變化供結算視窗顯示。 */
export function applyTrialReward(state: GameState): TrialResult {
  // 已達試煉加成上限：不再給折扣／重算（避免成長暴走）。
  if (state.progress.trialResearchLayers >= TRIAL_RESEARCH_LAYER_CAP) {
    return { changes: [], refunded: false, capped: true };
  }
  state.progress.trialResearchLayers += 1;
  const oldGrowth = researchStageGrowthFactor(state);
  state.reincarnation.buffs.research += 1; // 套用研究折扣
  const newGrowth = researchStageGrowthFactor(state);

  const changes: TrialChange[] = [];
  let refunded = false;

  for (const stat of Object.keys(state.research.stages)) {
    const from = state.research.stages[stat] ?? 0;
    if (from <= 0) continue;
    const spend = totalSpend(from, STAGE_BASE_COST, oldGrowth);
    const { level, leftover } = relevel(spend, STAGE_BASE_COST, newGrowth);
    state.research.stages[stat] = level;
    if (leftover > 0) { state.essences[stat] = (state.essences[stat] ?? 0) + leftover; refunded = true; }
    if (level !== from) changes.push({ label: affixLabel(stat as Affix["stat"]), from, to: level });
  }
  for (const slot of Object.keys(state.baseResearch) as BaseResearchSlot[]) {
    const from = state.baseResearch[slot] ?? 0;
    if (from <= 0) continue;
    const spend = totalSpend(from, BASE_STAGE_BASE_COST, oldGrowth);
    const { level, leftover } = relevel(spend, BASE_STAGE_BASE_COST, newGrowth);
    state.baseResearch[slot] = level;
    if (leftover > 0) { state.crystals[slot] = (state.crystals[slot] ?? 0) + leftover; refunded = true; }
    if (level !== from) changes.push({ label: BASE_RESEARCH_LABEL[slot], from, to: level });
  }
  return { changes, refunded, capped: false };
}

/** 一次性修復暴走存檔：研究折扣層數壓回上限 5，並用「暴走當下各等級所需精髓量」在 5 層折扣下重算等級，
 *  把被灌爆的研究等級（含攻速等）倒推修回。對未暴走（≤5 層）存檔為無害（僅夾住計數）。 */
export function fixRunawayResearch(state: GameState): void {
  state.progress.trialResearchLayers = Math.min(TRIAL_RESEARCH_LAYER_CAP, state.progress.trialResearchLayers ?? 0);
  if (state.reincarnation.buffs.research <= TRIAL_RESEARCH_LAYER_CAP) return;

  // 暴走（nerf 前）的「未夾」成長率：可能 < 1，用以反推當時各等級僅需的微量精髓
  const oldGrowth = 2 * 0.8 ** state.reincarnation.buffs.research;
  const affixSpend: Record<string, number> = {};
  for (const stat of Object.keys(state.research.stages)) {
    const level = state.research.stages[stat] ?? 0;
    if (level > 0) affixSpend[stat] = totalSpend(level, STAGE_BASE_COST, oldGrowth);
  }
  const baseSpend: Partial<Record<BaseResearchSlot, number>> = {};
  for (const slot of Object.keys(state.baseResearch) as BaseResearchSlot[]) {
    const level = state.baseResearch[slot] ?? 0;
    if (level > 0) baseSpend[slot] = totalSpend(level, BASE_STAGE_BASE_COST, oldGrowth);
  }

  state.reincarnation.buffs.research = TRIAL_RESEARCH_LAYER_CAP;
  state.progress.trialResearchLayers = TRIAL_RESEARCH_LAYER_CAP;
  const newGrowth = researchStageGrowthFactor(state);

  for (const stat of Object.keys(affixSpend)) {
    state.research.stages[stat] = relevel(affixSpend[stat], STAGE_BASE_COST, newGrowth).level;
  }
  for (const slot of Object.keys(baseSpend) as BaseResearchSlot[]) {
    state.baseResearch[slot] = relevel(baseSpend[slot] ?? 0, BASE_STAGE_BASE_COST, newGrowth).level;
  }
}
