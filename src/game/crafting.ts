import type { GameState, Equipment, Affix, AffixDef, AffixTier, RecipeDef, Slot } from "./types.ts";
import { RECIPES, AFFIX_COUNT_WEIGHTS, CRAFTERS } from "./content.ts";
import { spend } from "./inventory.ts";
import { passesFilter } from "./filter.ts";
import { totalMachinePurchaseCost } from "./machineCosts.ts";

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

// ---- 製裝機（每槽一台）：佇列式製裝，速度 = 基礎 × 運轉台數 ----

/** 製造一台某槽製裝機（花建造素材），總台數 +1 並預設運轉。成功回 true。 */
export function craftCrafter(state: GameState, slot: Slot): boolean {
  const def = CRAFTERS[slot];
  if (!def) return false;
  const c = state.crafters[slot];
  if (!spend(state, totalMachinePurchaseCost(def.buildCost, c.count, 1))) return false;
  c.count += 1;
  c.active += 1; // 新機台預設運轉
  return true;
}

/** 配置某槽製裝機運轉台數（+/-，0..count）。機台不消失，不退素材。 */
export function setCrafterActive(state: GameState, slot: Slot, delta: number): void {
  const c = state.crafters[slot];
  if (!c) return;
  c.active = Math.max(0, Math.min(c.count, c.active + delta));
}

/** 把 qty 件加入某槽製裝佇列。 */
export function enqueueCraft(state: GameState, slot: Slot, qty: number): void {
  const c = state.crafters[slot];
  if (!c) return;
  c.queue = Math.max(0, c.queue + qty);
}

/** 清空某槽製裝佇列。 */
export function clearCraftQueue(state: GameState, slot: Slot): void {
  const c = state.crafters[slot];
  if (c) c.queue = 0;
}

/** 製裝機 tick：進度以運轉台數倍速前進；每滿一週期從佇列取 1 件製裝（消耗配方材料）。
 *  缺料則停在週期末等料並標 idle；佇列空則歸零閒置。 */
export function tickCrafters(state: GameState, dt: number): void {
  for (const slot of ["weapon", "armor", "accessory"] as Slot[]) {
    const c = state.crafters[slot];
    const def = CRAFTERS[slot];
    if (!c || !def) continue;
    if (c.active <= 0 || c.queue <= 0) {
      c.progress = 0;
      c.idle = false;
      continue;
    }
    c.progress += dt * c.active; // 運轉台數越多越快
    if (c.progress < def.cycleTime) continue;

    const cycles = Math.floor(c.progress / def.cycleTime);
    let made = 0;
    let blocked = false;
    while (made < cycles && c.queue > 0) {
      if (!craft(state, slot)) {
        blocked = true; // 缺料：本件做不出來
        break;
      }
      c.queue -= 1;
      made += 1;
    }
    if (made > 0) c.progress -= def.cycleTime * made;
    if (blocked) {
      c.progress = def.cycleTime; // 缺料：停在週期末等料
      c.idle = true;
    } else {
      c.idle = false;
      if (c.queue <= 0) c.progress = 0; // 佇列清空 → 歸零
    }
  }
}
