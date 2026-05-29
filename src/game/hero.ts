import type { GameState, StatBlock, Equipment } from "./types.ts";
import { HERO_BASE, HERO_BASE_INTERVAL } from "./content.ts";
import { strengthBonus, baseBonus } from "./research.ts";

const DMG_REDUCTION_CAP = 0.9;

/** 推導英雄最終屬性。武器採「本地」計算：點傷／local% 只作用於武器自身，
 *  防具／飾品則全域加總。 */
export function deriveStats(state: GameState): StatBlock {
  const s: StatBlock = { ...HERO_BASE };

  // 防具、飾品：全域加總（基底 + 詞綴；詞綴吃研究強度加成）
  for (const slot of ["armor", "accessory"] as const) {
    const eq = state.equipped[slot];
    if (eq) applyGlobal(state, s, eq);
  }

  // 武器：本地物理計算 —— (武器基底 + 武器點傷) × (1 + local%)
  const w = state.equipped.weapon;
  if (w) {
    const base = (w.base.atk ?? 0) * (1 + baseBonus(state, "weapon")); // 基底研究加成
    let flat = 0;
    let local = 0;
    for (const aff of w.affixes) {
      const v = aff.value * (1 + strengthBonus(state, aff.stat)); // 研究強度加成
      if (aff.stat === "atk") flat += v;
      else if (aff.stat === "localPhysPct") local += v;
      else s[aff.stat] += v; // 暴擊／暴傷／攻速等仍為全域
    }
    s.atk += (base + flat) * (1 + local); // 併入總攻擊（全域點傷已在 s.atk）
  }
  s.localPhysPct = 0; // 本地值已消化，最終不再使用

  if (s.dmgReductionPct > DMG_REDUCTION_CAP) s.dmgReductionPct = DMG_REDUCTION_CAP;
  return s;
}

/** 全域套用：基底所有欄位（吃基底研究加成）+ 所有詞綴（吃詞綴研究加成）。 */
function applyGlobal(state: GameState, s: StatBlock, eq: Equipment): void {
  const baseMult = 1 + baseBonus(state, eq.slot);
  for (const k in eq.base) {
    const key = k as keyof StatBlock;
    s[key] += (eq.base[key] ?? 0) * baseMult;
  }
  for (const aff of eq.affixes) {
    s[aff.stat] += aff.value * (1 + strengthBonus(state, aff.stat));
  }
}

/** 實際攻擊間隔（秒）。 */
export function attackInterval(stats: StatBlock): number {
  return HERO_BASE_INTERVAL / (1 + stats.haste);
}
