import type { GameState, RuneId, StatBlock } from "./types.ts";

export interface RuneDef {
  id: RuneId;
  name: string;
  icon: string;
  summary: string;
  drawback: string;
}

export const INITIAL_RUNES: RuneId[] = ["berserk_haste", "vital_regen"];

export const RUNE_DEFS: Record<RuneId, RuneDef> = {
  berserk_haste: {
    id: "berserk_haste",
    name: "\u72c2\u6230\u7b26\u6587",
    icon: "\u16a2",
    summary: "\u6bcf\u5931\u53bb 25 \u751f\u547d\uff0c\u7372\u5f97 8% \u66f4\u591a\u653b\u901f",
    drawback: "\u526f\u4f5c\u7528\uff1a\u79d2\u56de\u6e1b\u534a",
  },
  vital_regen: {
    id: "vital_regen",
    name: "\u518d\u751f\u7b26\u6587",
    icon: "\u16c9",
    summary: "\u6bcf\u79d2\u56de\u5fa9 3% \u6700\u5927\u751f\u547d",
    drawback: "\u526f\u4f5c\u7528\uff1a\u683c\u64cb\u6e1b\u50b7\u91cf\u6e1b\u534a",
  },
};

export function runeAttackSpeedMore(state: GameState, maxHp: number): number {
  if (state.runes.selected !== "berserk_haste") return 1;
  const missingHp = Math.max(0, maxHp - Math.max(0, state.combat.heroHp));
  return 1 + Math.floor(missingHp / 25) * 0.08;
}

export function applyRuneStatOverrides(state: GameState, stats: StatBlock): void {
  if (state.runes.selected === "berserk_haste") {
    stats.hpRegen *= 0.5;
    return;
  }
  if (state.runes.selected === "vital_regen") {
    stats.hpRegen += stats.hp * 0.03;
  }
}

export function runeBlockReductionBonus(state: GameState): number {
  return state.runes.selected === "vital_regen" ? 0.125 : 0.25;
}
