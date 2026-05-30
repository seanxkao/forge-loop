import type { GameState, Affix, Equipment, Slot } from "./types.ts";
import { spend } from "./inventory.ts";
import { DISMANTLER } from "./content.ts";

// ---- 基底研究：消耗該槽裝備道具，永久提升該槽基底數值（待平衡） ----
const BASE_STAGE_BASE_COST = 5; // 首階需消耗的件數
const BASE_STRENGTH_PER_STAGE = 0.2; // 每階 +20% 該槽基底

/** 某槽已完成 stages 階後，下一階所需消耗件數（每階 ×2）。 */
export function baseStageCost(stages: number): number {
  return BASE_STAGE_BASE_COST * 2 ** stages;
}

/** 某槽基底目前的強度加成（乘在該槽基底數值上）。 */
export function baseBonus(state: GameState, slot: Slot): number {
  return BASE_STRENGTH_PER_STAGE * (state.baseResearch[slot] ?? 0);
}

/** 倉庫 ＋ 主背包中該槽可消耗的裝備件數。 */
export function baseItemsAvailable(state: GameState, slot: Slot): number {
  const inBag = (bag: Equipment[]) => bag.reduce((n, e) => n + (e.slot === slot ? 1 : 0), 0);
  return inBag(state.warehouseInv) + inBag(state.equipmentInv);
}

/** 投入研究該槽基底：足量則消耗（倉庫優先、再主背包），完成一階。成功回 true。 */
export function researchBase(state: GameState, slot: Slot): boolean {
  const need = baseStageCost(state.baseResearch[slot] ?? 0);
  if (baseItemsAvailable(state, slot) < need) return false;
  let remaining = need;
  for (const bag of [state.warehouseInv, state.equipmentInv]) {
    for (let i = bag.length - 1; i >= 0 && remaining > 0; i--) {
      if (bag[i].slot === slot) {
        bag.splice(i, 1);
        remaining--;
      }
    }
  }
  state.baseResearch[slot] = (state.baseResearch[slot] ?? 0) + 1;
  return true;
}

// 數值皆待平衡
const STAGE_BASE_COST = 50; // 首階所需研究值
const RESEARCH_PER_TIER = 10; // T3 起每階乘數（T3=10、T4=20…）
const STRENGTH_PER_STAGE = 0.1; // 每完成一階 +10% 該類詞綴強度
export const DISMANTLE_CYCLE = 2; // 拆解一件所需秒數

/** 某軌已完成 stages 階後，下一階所需研究值（每階 ×2）。 */
export function stageCost(stages: number): number {
  return STAGE_BASE_COST * 2 ** stages;
}

/** 一條詞綴（T3+）銷毀可得的研究值；T 越高越多，T1～T2 為 0。 */
export function affixResearchValue(aff: Affix): number {
  return aff.tier >= 3 ? (aff.tier - 2) * RESEARCH_PER_TIER : 0;
}

/** 該類詞綴目前的強度加成（乘在詞綴數值上）。 */
export function strengthBonus(state: GameState, stat: string): number {
  return STRENGTH_PER_STAGE * (state.research.stages[stat] ?? 0);
}

/** 把研究值灌進某類詞綴的研究軌，結算可完成的階段（累積不受前置鎖限制）。 */
export function addResearch(state: GameState, stat: string, value: number): void {
  const r = state.research;
  r.points[stat] = (r.points[stat] ?? 0) + value;
  let stages = r.stages[stat] ?? 0;
  while (r.points[stat] >= stageCost(stages)) {
    r.points[stat] -= stageCost(stages);
    stages += 1;
  }
  r.stages[stat] = stages;
}

/** 該裝備是否有研究價值（含至少一條 T3+ 詞綴）。 */
function hasResearchValue(eq: Equipment): boolean {
  return eq.affixes.some((a) => a.tier >= 3);
}

/** 倉庫中可拆（有研究值）的裝備數。 */
export function dismantleableCount(state: GameState): number {
  return state.warehouseInv.reduce((n, eq) => n + (hasResearchValue(eq) ? 1 : 0), 0);
}

/** 製造一台拆解機（花素材），總台數 +1 並預設運轉。成功回 true。 */
export function craftDismantler(state: GameState): boolean {
  if (!spend(state, DISMANTLER.buildCost)) return false;
  state.dismantler.count += 1;
  state.dismantler.active += 1;
  return true;
}

/** 配置拆解機運轉台數（+/-，0..count）。 */
export function setDismActive(state: GameState, delta: number): void {
  const d = state.dismantler;
  d.active = Math.max(0, Math.min(d.count, d.active + delta));
}

/** 拆解器 tick：速度 = 基礎 × 運轉台數；每週期取「有研究值」的裝備銷毀（跳過爛裝）。
 *  效能：只在累積滿一週期時才掃倉庫（findIndex），避免每幀對成長中的倉庫做 O(N) 掃描。 */
export function tickDismantler(state: GameState, dt: number): void {
  const d = state.dismantler;
  if (d.active <= 0) {
    d.progress = 0;
    return;
  }
  d.progress += dt * d.active; // 運轉台數越多越快
  if (d.progress < DISMANTLE_CYCLE) return; // 未滿週期：免掃倉庫
  while (d.progress >= DISMANTLE_CYCLE) {
    const idx = state.warehouseInv.findIndex(hasResearchValue);
    if (idx < 0) {
      d.progress = 0; // 無可拆 → 歸零閒置（每滿一週期才掃一次）
      break;
    }
    const eq = state.warehouseInv.splice(idx, 1)[0];
    for (const aff of eq.affixes) {
      const v = affixResearchValue(aff);
      if (v > 0) addResearch(state, aff.stat, v);
    }
    d.progress -= DISMANTLE_CYCLE;
  }
}
