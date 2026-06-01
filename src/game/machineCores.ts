import type {
  Affix,
  AffixDef,
  AffixStat,
  AffixTag,
  CoreItem,
  Equipment,
  GameState,
  Item,
} from "./types.ts";
import { affixTags, isPctAffix, withDerivedAffixMeta } from "./affixMeta.ts";
import { affixBonusMultiplier } from "./itemAffixes.ts";

export interface MachineCoreEffects {
  productivity: number;
  machineSpeedPct: number;
  materialRefundPct: number;
  upgradeTierChance: number;
  rarityBonus: number;
  luckyTierChance: number;
  tagWeights: Record<AffixTag, number>;
}

export type CoreSlots = [CoreItem | null, CoreItem | null];

export function emptyMachineCoreEffects(): MachineCoreEffects {
  return {
    productivity: 0,
    machineSpeedPct: 0,
    materialRefundPct: 0,
    upgradeTierChance: 0,
    rarityBonus: 0,
    luckyTierChance: 0,
    tagWeights: {
      physical: 0,
      crit: 0,
      speed: 0,
      life: 0,
      defense: 0,
      craft: 0,
    },
  };
}

/** 由一組核心插槽推導機台效果（核心固定詞吃核心基底研究加成）。 */
export function machineCoreEffects(
  state: GameState,
  cores: ReadonlyArray<CoreItem | null>,
): MachineCoreEffects {
  const effects = emptyMachineCoreEffects();
  for (const core of cores) {
    if (!core) continue;
    for (const affix of core.affixes) {
      const value = effectiveAffixValue(state, affix);
      switch (affix.stat) {
        case "productivity":
          effects.productivity += value;
          break;
        case "machineSpeedPct":
          effects.machineSpeedPct += value;
          break;
        case "materialRefundPct":
          effects.materialRefundPct += value;
          break;
        case "upgradeTierChance":
          effects.upgradeTierChance += value;
          break;
        case "rarityBonus":
          effects.rarityBonus += value;
          break;
        case "luckyTierChance":
          effects.luckyTierChance += value;
          break;
        case "weightPhysical":
          effects.tagWeights.physical += value;
          break;
        case "weightCrit":
          effects.tagWeights.crit += value;
          break;
        case "weightSpeed":
          effects.tagWeights.speed += value;
          break;
        case "weightLife":
          effects.tagWeights.life += value;
          break;
        case "weightDefense":
          effects.tagWeights.defense += value;
          break;
        case "weightCraft":
          effects.tagWeights.craft += value;
          break;
      }
    }
  }
  return effects;
}

export function weightedAffixPool(pool: AffixDef[], tagWeights: Record<AffixTag, number>): AffixDef[] {
  return pool.map((def) => {
    const bonus = (def.tags ?? []).reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0);
    return {
      ...def,
      tiers: def.tiers.map((tier) => ({
        ...tier,
        weight: tier.weight * (1 + bonus),
      })),
    };
  });
}

export function boostAffixTier(defs: AffixDef[], affixes: Affix[], rng: () => number = Math.random): void {
  if (affixes.length <= 0) return;
  const index = Math.floor(rng() * affixes.length);
  const target = affixes[index];
  const def = defs.find((entry) => entry.stat === target.stat);
  if (!def) return;
  const tierIndex = def.tiers.findIndex((tier) => tier.tier === target.tier);
  if (tierIndex < 0 || tierIndex >= def.tiers.length - 1) return;
  const nextTier = def.tiers[tierIndex + 1];
  target.tier = nextTier.tier;
  target.value = rollTierValue(nextTier.min, nextTier.max, isPctAffix(target.stat), rng);
}

export function effectiveAffixValue(state: GameState, affix: Affix): number {
  return affix.value * affixBonusMultiplier(state, { kind: "core", slot: "core", rarity: "magic" }, affix);
}

export function rollTierValue(min: number, max: number, pct: boolean, rng: () => number = Math.random): number {
  const raw = min + rng() * (max - min);
  return pct ? Math.round(raw * 10000) / 10000 : Math.round(raw);
}

/** 把一顆核心插進指定插槽組；原本插著的退回主背包。成功回 true。 */
export function socketCore(
  state: GameState,
  cores: CoreSlots,
  slotIndex: number,
  uid: number,
  fromWarehouse: boolean,
): boolean {
  if (slotIndex < 0 || slotIndex > 1) return false;
  const source = fromWarehouse ? state.warehouseInv : state.equipmentInv;
  const idx = source.findIndex((item) => item.uid === uid && item.kind === "core");
  if (idx < 0) return false;
  const current = cores[slotIndex];
  if (current) state.equipmentInv.push(current);
  cores[slotIndex] = source.splice(idx, 1)[0] as CoreItem;
  return true;
}

/** 卸下指定插槽核心，退回主背包。 */
export function unsocketCore(state: GameState, cores: CoreSlots, slotIndex: number): boolean {
  const current = cores[slotIndex];
  if (!current) return false;
  cores[slotIndex] = null;
  state.equipmentInv.push(current);
  return true;
}

export function isCoreItem(item: Item): item is CoreItem {
  return item.kind === "core";
}

export function isEquipmentItem(item: Item): item is Equipment {
  return item.kind === "equipment";
}

export function normalizeCoreAffixDef(def: AffixDef): AffixDef {
  return withDerivedAffixMeta({
    ...def,
    tags: def.tags ?? affixTags(def.stat as AffixStat),
  });
}
