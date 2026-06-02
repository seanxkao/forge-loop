import type { BaseResearchSlot, GameState, Affix, Item } from "./types.ts";
import { researchStageGrowthFactor } from "./reincarnation.ts";
import { machineCoreEffects } from "./machineCores.ts";

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
const RESEARCH_PER_TIER = 10;
const STRENGTH_PER_STAGE = 0.1;
export const DISMANTLE_CYCLE = 2;

/** 詞綴研究升一階所需精髓數（沿用舊研究值曲線：50、×成長…）。 */
export function stageCost(state: GameState, stages: number): number {
  return Math.max(1, Math.round(STAGE_BASE_COST * researchStageGrowthFactor(state) ** stages));
}

/** 一條 T3 以上詞綴拆出的精髓量（＝舊研究值，使所需裝備量與以前一致）。 */
export function affixResearchValue(aff: Affix): number {
  return aff.tier >= 3 ? (aff.tier - 2) * RESEARCH_PER_TIER : 0;
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
