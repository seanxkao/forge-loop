import type { GameState, Equipment, Affix, AffixDef, AffixTier, RecipeDef } from "./types.ts";
import { RECIPES, AFFIX_COUNT_WEIGHTS } from "./content.ts";
import { spend } from "./inventory.ts";
import { passesFilter } from "./filter.ts";

/** 依權重抽詞綴數量（1～4）。 */
function rollCount(): number {
  const total = AFFIX_COUNT_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < AFFIX_COUNT_WEIGHTS.length; i++) {
    r -= AFFIX_COUNT_WEIGHTS[i];
    if (r < 0) return i + 1;
  }
  return AFFIX_COUNT_WEIGHTS.length;
}

/** 依各階權重抽一個品質階（越高階越難中）。 */
function rollTier(def: AffixDef): AffixTier {
  const total = def.tiers.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * total;
  for (const t of def.tiers) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return def.tiers[def.tiers.length - 1];
}

/** 抽一條完整詞綴：先抽階、再在該階範圍 roll 值。 */
function rollOneAffix(def: AffixDef): Affix {
  const t = rollTier(def);
  const raw = t.min + Math.random() * (t.max - t.min);
  const value = def.pct ? Math.round(raw * 1000) / 1000 : Math.round(raw);
  return { stat: def.stat, value, label: def.label, pct: def.pct, tier: t.tier };
}

/** 從配方詞綴池無重複抽詞綴；數量隨機 1～4（受池大小上限）。 */
function rollAffixes(recipe: RecipeDef): Affix[] {
  const pool = [...recipe.affixPool];
  const out: Affix[] = [];
  const n = Math.min(rollCount(), pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(rollOneAffix(pool[idx]));
    pool.splice(idx, 1);
  }
  return out;
}

/** 製作裝備。通過過濾器進主背包，否則進倉庫。材料不足回 null。 */
export function craft(state: GameState, recipeId: string): Equipment | null {
  const recipe = RECIPES[recipeId];
  if (!recipe) return null;
  if (!spend(state, recipe.cost)) return null;

  const eq: Equipment = {
    uid: state.nextEquipId++,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    slot: recipe.slot,
    base: { ...recipe.base },
    affixes: rollAffixes(recipe),
  };
  if (passesFilter(state, eq)) state.equipmentInv.push(eq);
  else state.warehouseInv.push(eq);
  return eq;
}
