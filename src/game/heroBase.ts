import type { StatBlock } from "./types.ts";

/** 英雄裸值（無裝備，極弱；待平衡）。 */
export const HERO_BASE: StatBlock = {
  hp: 50,
  atk: 7,
  localPhysPct: 0,
  localHastePct: 0,
  def: 0,
  critChance: 0.05,
  critMult: 1.5,
  haste: 0,
  hpRegen: 0,
  dmgReductionPct: 0,
  blockChance: 0,
  defPenPct: 0,
};

/** 英雄基礎攻擊間隔 = 1.2 / (1 + haste)。 */
export const HERO_BASE_INTERVAL = 1.2;
