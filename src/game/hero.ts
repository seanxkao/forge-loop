import type { GameState, StatBlock, Equipment } from "./types.ts";
import { HERO_BASE, HERO_BASE_INTERVAL } from "./heroBase.ts";
import { baseBonus } from "./research.ts";
import { affixBonusMultiplier } from "./itemAffixes.ts";
import { powerMultiplier } from "./reincarnation.ts";

const DMG_REDUCTION_CAP = 0.9;

export function deriveStats(state: GameState): StatBlock {
  const s: StatBlock = { ...HERO_BASE };

  if (state.equipped.armor) applyGlobal(state, s, state.equipped.armor);
  for (const accessory of state.equipped.accessory) {
    if (accessory) applyGlobal(state, s, accessory);
  }

  const w = state.equipped.weapon;
  if (w) {
    const base = (w.base.atk ?? 0) * (1 + baseBonus(state, "weapon"));
    let flat = 0;
    let local = 0;
    for (const aff of w.affixes) {
      const v = aff.value * affixBonusMultiplier(state, w, aff);
      if (aff.stat === "atk") flat += v;
      else if (aff.stat === "localPhysPct") local += v;
      else if (aff.stat === "localHastePct") s.localHastePct += v;
      else if (aff.stat in s) s[aff.stat as keyof StatBlock] += v;
    }
    s.atk += (base + flat) * (1 + local);
  }
  s.localPhysPct = 0;

  const power = powerMultiplier(state);
  s.hp *= power;
  s.atk *= power;
  s.def *= power;
  s.haste *= power;
  s.critChance *= power;
  s.critMult *= power;

  if (s.dmgReductionPct > DMG_REDUCTION_CAP) s.dmgReductionPct = DMG_REDUCTION_CAP;
  if (s.blockChance > 1) s.blockChance = 1;
  return s;
}

function applyGlobal(state: GameState, s: StatBlock, eq: Equipment): void {
  const baseMult = 1 + baseBonus(state, eq.slot);
  for (const k in eq.base) {
    const key = k as keyof StatBlock;
    s[key] += (eq.base[key] ?? 0) * baseMult;
  }
  for (const aff of eq.affixes) {
    if (aff.stat in s) {
      s[aff.stat as keyof StatBlock] += aff.value * affixBonusMultiplier(state, eq, aff);
    }
  }
}

export function attackInterval(stats: StatBlock): number {
  return HERO_BASE_INTERVAL / ((1 + stats.haste) * (1 + stats.localHastePct));
}
