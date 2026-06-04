import type { GameState, RuneId, RuneStoneId, StatBlock } from "./types.ts";

export interface RuneDef {
  id: RuneId;
  name: string;
  icon: string;
  summary: string;
  drawback: string;
}

export interface RuneStoneDef {
  id: RuneStoneId;
  name: string;
  icon: string;
  summary: string;
  /** 符文效果倍率（乘在等級倍率之上）。 */
  effectMult: number;
  /** 符文副作用倍率（縮放可數值化的副作用）。 */
  drawbackMult: number;
  /** 是否可同時裝備 2 個符文。 */
  dual: boolean;
}

export const INITIAL_RUNES: RuneId[] = ["berserk_haste", "vital_regen"];

/** 進化符文：英雄每層進化的基準比率（同進化使徒機制，數值較低；會再乘符文等級／符石倍率）。 */
export const RUNE_EVOLVE_RATE = 0.10;

export const RUNE_MAX_LEVEL = 20;
const RUNE_LEVEL_BASE_COST = 1000;
const RUNE_LEVEL_COST_GROWTH = 1.6;
/** 解鎖一顆符石所需的符文碎片。 */
export const RUNE_STONE_COST = 4000;
export const RUNE_SHARD = "runeShard";

const BERSERK_SPEED_PER_25 = 0.08;
const VITAL_REGEN_PCT = 0.03;
const BLOCK_BONUS_BASE = 0.25;

export const RUNE_DEFS: Record<RuneId, RuneDef> = {
  berserk_haste: {
    id: "berserk_haste",
    name: "狂戰符文",
    icon: "ᚢ",
    summary: "每失去 25 生命，獲得 8% 更多攻速",
    drawback: "副作用：秒回減半",
  },
  vital_regen: {
    id: "vital_regen",
    name: "再生符文",
    icon: "ᛉ",
    summary: "每秒回復 3% 最大生命",
    drawback: "副作用：格擋額外減傷砍半",
  },
  evolve: {
    id: "evolve",
    name: "進化符文",
    icon: "🧬",
    summary: "戰鬥中每 5 秒輪流 +10% 攻擊／防禦／攻速（累加）",
    drawback: "死亡或換關時層數歸零",
  },
};

export const RUNE_STONES: Record<RuneStoneId, RuneStoneDef> = {
  less_drawback: {
    id: "less_drawback",
    name: "穩固符石",
    icon: "🔵",
    summary: "符文副作用 ×0.5",
    effectMult: 1,
    drawbackMult: 0.5,
    dual: false,
  },
  amplify: {
    id: "amplify",
    name: "狂暴符石",
    icon: "🔴",
    summary: "符文效果 ×1.8、副作用 ×1.4",
    effectMult: 1.8,
    drawbackMult: 1.4,
    dual: false,
  },
  dual: {
    id: "dual",
    name: "雙生符石",
    icon: "🟣",
    summary: "可同時裝備 2 個符文",
    effectMult: 1,
    drawbackMult: 1,
    dual: true,
  },
};

export function runeLevel(state: GameState, id: RuneId): number {
  return Math.min(RUNE_MAX_LEVEL, Math.max(1, state.runes.levels[id] ?? 1));
}

/** 由 level 升到 level+1 所需的符文碎片（1000×1.6^(level-1)）。 */
export function runeLevelCost(level: number): number {
  return Math.round(RUNE_LEVEL_BASE_COST * RUNE_LEVEL_COST_GROWTH ** (level - 1));
}

export function activeStone(state: GameState): RuneStoneDef | null {
  const s = state.runes.selectedStone;
  return s ? RUNE_STONES[s] : null;
}

/** 同時可生效的符文數（雙生符石＝2，否則 1）。 */
export function maxActiveRunes(state: GameState): number {
  return activeStone(state)?.dual ? 2 : 1;
}

/** 當前實際生效的符文（過濾未擁有、依符石上限截斷）。 */
export function activeRunes(state: GameState): RuneId[] {
  const sel = Array.isArray(state.runes.selected) ? state.runes.selected : [];
  return sel.filter((id) => state.runes.owned.includes(id)).slice(0, maxActiveRunes(state));
}

/** 某符文的效果倍率 ＝ 等級倍率(1+0.1×(lv-1)) × 符石效果倍率。 */
export function runeEffectMult(state: GameState, id: RuneId): number {
  const lv = runeLevel(state, id);
  const stoneE = activeStone(state)?.effectMult ?? 1;
  return (1 + 0.1 * (lv - 1)) * stoneE;
}

/** 副作用倍率（縮放可數值化的副作用）。 */
function runeDrawbackMult(state: GameState): number {
  return activeStone(state)?.drawbackMult ?? 1;
}

export function runeAttackSpeedMore(state: GameState, maxHp: number): number {
  if (!activeRunes(state).includes("berserk_haste")) return 1;
  const missingHp = Math.max(0, maxHp - Math.max(0, state.combat.heroHp));
  return 1 + Math.floor(missingHp / 25) * BERSERK_SPEED_PER_25 * runeEffectMult(state, "berserk_haste");
}

export function applyRuneStatOverrides(state: GameState, stats: StatBlock): void {
  const runes = activeRunes(state);
  const db = runeDrawbackMult(state);
  if (runes.includes("vital_regen")) {
    stats.hpRegen += stats.hp * VITAL_REGEN_PCT * runeEffectMult(state, "vital_regen");
  }
  if (runes.includes("berserk_haste")) {
    // 副作用：秒回減半（幅度 0.5），可被符石縮放
    stats.hpRegen *= 1 - 0.5 * db;
  }
}

export function runeBlockReductionBonus(state: GameState): number {
  // 再生符文副作用：格擋額外減傷砍半（幅度 0.5），可被符石縮放
  if (activeRunes(state).includes("vital_regen")) return BLOCK_BONUS_BASE * (1 - 0.5 * runeDrawbackMult(state));
  return BLOCK_BONUS_BASE;
}

/** 進化符文當前每層比率（基準 × 等級／符石倍率）；未裝進化符文回 0。 */
export function runeEvolveRate(state: GameState): number {
  if (!activeRunes(state).includes("evolve")) return 0;
  return RUNE_EVOLVE_RATE * runeEffectMult(state, "evolve");
}

/** 花符文碎片升一級該符文（< 上限且碎片足夠才成功）。 */
export function upgradeRune(state: GameState, id: RuneId): boolean {
  const lv = runeLevel(state, id);
  if (lv >= RUNE_MAX_LEVEL) return false;
  const cost = runeLevelCost(lv);
  if ((state.inventory[RUNE_SHARD] ?? 0) < cost) return false;
  state.inventory[RUNE_SHARD] -= cost;
  state.runes.levels[id] = lv + 1;
  return true;
}

/** 花 4000 符文碎片解鎖一顆符石。 */
export function unlockStone(state: GameState, id: RuneStoneId): boolean {
  if (state.runes.unlockedStones.includes(id)) return false;
  if ((state.inventory[RUNE_SHARD] ?? 0) < RUNE_STONE_COST) return false;
  state.inventory[RUNE_SHARD] -= RUNE_STONE_COST;
  state.runes.unlockedStones.push(id);
  return true;
}

/** 選擇／取消符石（再點同一顆＝卸下）；取消雙生符石時把作用符文截斷為 1。 */
export function selectStone(state: GameState, id: RuneStoneId): void {
  if (!state.runes.unlockedStones.includes(id)) return;
  state.runes.selectedStone = state.runes.selectedStone === id ? null : id;
  const max = maxActiveRunes(state);
  if (state.runes.selected.length > max) state.runes.selected = state.runes.selected.slice(0, max);
}
