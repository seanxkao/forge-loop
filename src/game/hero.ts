import type { GameState, StatBlock, Equipment } from "./types.ts";
import { HERO_BASE, HERO_BASE_INTERVAL } from "./heroBase.ts";
import { baseBonus } from "./research.ts";
import { affixBonusMultiplier } from "./itemAffixes.ts";
import { powerMultiplier } from "./reincarnation.ts";
import { applyRuneStatOverrides, runeAttackSpeedMore } from "./runes.ts";
import { mutationCombatEffects } from "./mutation.ts";

const DMG_REDUCTION_CAP = 0.9;

export function deriveStats(state: GameState): StatBlock {
  const s: StatBlock = { ...HERO_BASE };
  const rMult = state.combat.researchMult ?? 1; // 試煉關：研究加成倍率（如 0.5 減半）
  const affMult = (eq: Equipment, aff: Equipment["affixes"][number]): number =>
    1 + (affixBonusMultiplier(state, eq, aff) - 1) * rMult;
  const baseB = (slot: Equipment["slot"]): number => baseBonus(state, slot) * rMult;

  if (state.equipped.armor) applyGlobal(s, state.equipped.armor, affMult, baseB);
  for (const accessory of state.equipped.accessory) {
    if (accessory) applyGlobal(s, accessory, affMult, baseB);
  }

  const w = state.equipped.weapon;
  if (w) {
    const baseMin = (w.base.atkMin ?? 0) * (1 + baseB("weapon"));
    const baseMax = (w.base.atkMax ?? 0) * (1 + baseB("weapon"));
    let flatMin = 0;
    let flatMax = 0;
    let local = 0;
    for (const aff of w.affixes) {
      if (aff.mutation) continue; // 變異詞效果另行處理（mutationCombatEffects）
      const v = aff.value * affMult(w, aff);
      if (aff.stat === "atk") {
        flatMin += v;
        flatMax += (aff.valueMax ?? aff.value) * affMult(w, aff);
      }
      else if (aff.stat === "localPhysPct") local += v;
      else if (aff.stat === "localHastePct") s.localHastePct += v;
      else if (aff.stat in s) s[aff.stat as keyof StatBlock] += v;
    }
    s.atkMin += (baseMin + flatMin) * (1 + local);
    s.atkMax += (baseMax + flatMax) * (1 + local);
  }
  s.localPhysPct = 0;

  const power = powerMultiplier(state);
  s.hp *= power;
  s.atkMin *= power;
  s.atkMax *= power;
  s.def *= power;
  s.haste *= power;
  s.critChance *= power;
  s.critMult *= power;

  // 變異「最大生命%」：所有已裝備防具的 mutMaxHpPct 相加後乘上最大生命
  s.hp *= 1 + mutationCombatEffects(state).maxHpPct;

  applyRuneStatOverrides(state, s);

  if (s.dmgReductionPct > DMG_REDUCTION_CAP) s.dmgReductionPct = DMG_REDUCTION_CAP;
  if (s.blockChance > 1) s.blockChance = 1;
  return s;
}

function applyGlobal(
  s: StatBlock,
  eq: Equipment,
  affMult: (eq: Equipment, aff: Equipment["affixes"][number]) => number,
  baseB: (slot: Equipment["slot"]) => number,
): void {
  const baseMult = 1 + baseB(eq.slot);
  for (const k in eq.base) {
    const key = k as keyof typeof eq.base;
    if (key === "atkMin" || key === "atkMax") {
      s[key] += (eq.base[key] ?? 0) * baseMult;
    } else {
      s[key as keyof StatBlock] += (eq.base[key] ?? 0) * baseMult;
    }
  }
  // 變異「詞綴增幅」：同件的 mutAmplify 放大「同件其他（非變異）詞綴」的數值
  const amp = 1 + (eq.affixes.find((a) => a.stat === "mutAmplify")?.value ?? 0);
  for (const aff of eq.affixes) {
    if (aff.mutation) continue; // 變異詞效果另行處理（mutationCombatEffects）
    if (aff.stat === "atk") {
      const mult = affMult(eq, aff) * amp;
      s.atkMin += aff.value * mult;
      s.atkMax += (aff.valueMax ?? aff.value) * mult;
    } else if (aff.stat in s) {
      s[aff.stat as keyof StatBlock] += aff.value * affMult(eq, aff) * amp;
    }
  }
}

export function attackInterval(state: GameState, stats: StatBlock): number {
  return HERO_BASE_INTERVAL / ((1 + stats.haste) * (1 + stats.localHastePct) * runeAttackSpeedMore(state, stats.hp));
}
