import type { GameState, EnemyDef, StageDef } from "./types.ts";
import { STAGES, findStage, CREATE_TRIAL_ID, POWER_TRIAL_ID } from "./content.ts";
import { deriveStats, attackInterval } from "./hero.ts";
import { add } from "./inventory.ts";
import { materialDropMultiplier } from "./reincarnation.ts";
import { runeBlockReductionBonus, activeRunes, runeEvolveRate } from "./runes.ts";
import { coerceUnlockedStageId, unlockAfterStageClear } from "./unlocks.ts";
import { grantLegendaryCoreReward } from "./legendaryCores.ts";
import { applyPendingLoadout } from "./loadout.ts";
import { applyTrialReward, type TrialResult } from "./research.ts";
import { mutationCombatEffects } from "./mutation.ts";
import { activeMachineCountByRecipe } from "./production.ts";

export function effectiveDefense(defense: number, penPct: number): number {
  const pen = Math.max(0, Math.min(1, penPct));
  return defense * (1 - pen);
}

/** 英雄單次命中對敵人的傷害（atk 為已套用暴擊／進化等倍率後的攻擊值）。唯一傷害公式來源，計算器共用。 */
export function resolveHeroDamage(atk: number, enemyDef: number, enemyDefPenByHero: number): number {
  return Math.max(1, Math.round(atk - effectiveDefense(enemyDef, enemyDefPenByHero)));
}

/** 敵人單次命中對英雄的傷害（reduction 為減傷＋格擋的合計、上限 0.95）。唯一傷害公式來源，計算器共用。 */
export function resolveEnemyDamage(enemyAtk: number, reduction: number, heroDef: number, enemyDefPen: number): number {
  return Math.max(1, Math.round(enemyAtk * (1 - reduction) - effectiveDefense(heroDef, enemyDefPen)));
}

function rollHeroAttack(stats: GameState["combat"] extends never ? never : { atkMin: number; atkMax: number }): number {
  if (stats.atkMax <= stats.atkMin) return stats.atkMin;
  return stats.atkMin + Math.random() * (stats.atkMax - stats.atkMin);
}

export interface CombatFx {
  onHeroAttack?(dmg: number, crit: boolean): void;
  onEnemyAttack?(dmg: number, blocked?: boolean): void;
  onEnemyKilled?(name: string): void;
  onHeroDied?(): void;
  onDrop?(mat: string, qty: number): void;
  onStageClear?(): void;
  onTrialComplete?(result: TrialResult): void;
  onNotice?(text: string): void;
}

export function getStage(stageId: string): StageDef {
  return findStage(stageId) ?? STAGES[0];
}

/** ?脣??蝙敺?撅日脣?瘥???*/
export const ENEMY_EVOLVE_RATE = 0.20;
const CREATE_HEAL_PER_MACHINE = 0.00001;
const CREATE_DAMAGE_MORE_PER_MACHINE = 0.0001;
const CREATE_ATTACK_SPEED_MULT = 2;
const CREATE_ATTACK_MODE_DAMAGE_REDUCTION = 0.99;
const CREATE_REGEN_PCT = 0.02;
const CREATE_MODE_DURATIONS: Record<0 | 1 | 2, number> = {
  0: 5,
  1: 10,
  2: 10,
};

function inCreateTrial(state: GameState): boolean {
  return state.combat.stageId === CREATE_TRIAL_ID;
}

function clearCreateTrialMaterials(state: GameState): void {
  state.inventory.living_gold = 0;
  state.inventory.biosteel = 0;
}

function convertBiosteelToStable(state: GameState): void {
  const remain = state.inventory.biosteel ?? 0;
  const stable = Math.floor(remain * 0.1);
  if (stable > 0) add(state, "stable_biosteel", stable);
  state.inventory.biosteel = 0;
  state.inventory.living_gold = 0;
}

function createModeLabel(mode: 0 | 1 | 2): string {
  return mode === 0 ? "防禦模式" : mode === 1 ? "攻擊模式" : "再生模式";
}

/** ?脣???蝬剖漲嚗嚗嚗????嚗敞??stacks 撅扎?撅?rate???頛詨嚗鈭綽??梢??梁??*/
function evolveFactor(stacks: number, rate: number): number {
  return 1 + rate * stacks;
}

/** ?脣??蝙敺?靘敞?惜?貊??箸鈭箝???潘??駁???蝮桃嚗?*/
function effectiveEnemy(c: GameState["combat"], enemy: EnemyDef): { atk: number; def: number; atkInterval: number } {
  if (!enemy.evolve) return { atk: enemy.atk, def: enemy.def, atkInterval: enemy.atkInterval };
  return {
    atk: enemy.atk * evolveFactor(c.evolveAtk, ENEMY_EVOLVE_RATE),
    def: enemy.def * evolveFactor(c.evolveDef, ENEMY_EVOLVE_RATE),
    atkInterval: enemy.atkInterval / evolveFactor(c.evolveSpd, ENEMY_EVOLVE_RATE),
  };
}

export function currentEnemyDef(state: GameState): EnemyDef {
  const stage = getStage(state.combat.stageId);
  const wave = stage.waves[state.combat.waveIndex] ?? stage.waves[0];
  return wave[state.combat.enemyIndex] ?? wave[0];
}

function resetEvolve(c: GameState["combat"]): void {
  c.evolveTimer = 0;
  c.evolveAtk = 0;
  c.evolveDef = 0;
  c.evolveSpd = 0;
  c.evolveNext = 0;
}

/** ?脣?蝚行?嚗飛?嗉?脣?撅斗嚗香鈭∴?????恬?頝冽郭銝?蝵殷???*/
function resetHeroEvolve(c: GameState["combat"]): void {
  c.heroEvolveTimer = 0;
  c.heroEvolveAtk = 0;
  c.heroEvolveDef = 0;
  c.heroEvolveSpd = 0;
  c.heroEvolveNext = 0;
}

export function startStage(state: GameState, stageId: string): void {
  applyPendingLoadout(state); // 銝?圈洛??嚗??冽擛乩葉?怠???鋆?蝚行?
  const c = state.combat;
  if (inCreateTrial(state) && stageId !== CREATE_TRIAL_ID) clearCreateTrialMaterials(state);
  c.stageId = coerceUnlockedStageId(state, stageId);
  if (c.stageId === CREATE_TRIAL_ID) clearCreateTrialMaterials(state);
  if (c.stageId === POWER_TRIAL_ID) state.progress.runeTabUnlocked = true; // 首次挑戰即解鎖符文分頁
  c.researchMult = getStage(c.stageId).researchMult ?? 1;
  c.waveIndex = 0;
  c.enemyIndex = 0;
  c.heroAtkTimer = 0;
  c.enemyAtkTimer = 0;
  c.clearPause = 0;
  c.pendingStageId = null;
  resetEvolve(c);
  resetHeroEvolve(c);
  c.createModeTimer = 0;
  c.createMode = 0;
  c.createModeAnnounced = false;
  c.heroHp = deriveStats(state).hp;
  spawnCurrent(state);
}

function spawnCurrent(state: GameState): void {
  const enemy = currentEnemyDef(state);
  state.combat.enemyHp = enemy.maxHp;
  state.combat.enemyAtkTimer = 0;
  resetEvolve(state.combat);
  state.combat.createModeTimer = 0;
  state.combat.createMode = 0;
  state.combat.createModeAnnounced = false;
  // 力量的使徒護盾：出場即帶滿盾
  state.combat.shieldHp = enemy.shield ?? 0;
  state.combat.shieldTimer = 0;
  state.combat.shieldBroken = false;
}

function advance(state: GameState, fx: CombatFx): void {
  const c = state.combat;
  const stage = getStage(c.stageId);
  const stageId = c.stageId;
  const isFinalEnemy =
    c.waveIndex === stage.waves.length - 1 &&
    c.enemyIndex === stage.waves[c.waveIndex].length - 1 &&
    stageId === STAGES[STAGES.length - 1].id;
  c.enemyIndex += 1;
  if (c.enemyIndex >= stage.waves[c.waveIndex].length) {
    c.enemyIndex = 0;
    c.waveIndex += 1;
    if (c.waveIndex >= stage.waves.length) {
      c.waveIndex = 0;
      c.heroHp = deriveStats(state).hp;
      c.heroAtkTimer = 0;
      c.enemyAtkTimer = 0;
      c.clearPause = 1;
      c.pendingStageId = null;
      c.enemyHp = 0;
      resetEvolve(c);
      if (stage.trial) {
        if (!state.runes.owned.includes("evolve")) state.runes.owned.push("evolve");
        if (stageId === CREATE_TRIAL_ID) {
          state.progress.createTrialCleared = true;
          convertBiosteelToStable(state);
        }
        if (stage.clearReward === "reincResearch") fx.onTrialComplete?.(applyTrialReward(state));
        c.pendingStageId = stageId;
      } else {
        unlockAfterStageClear(state, stageId);
        grantLegendaryCoreReward(state, stageId);
        if (isFinalEnemy && !state.reincarnation.gameCleared) {
          state.reincarnation.victoryPending = true;
          state.reincarnation.gameCleared = true;
        }
        const currentIndex = STAGES.findIndex((entry) => entry.id === stageId);
        const nextStage = STAGES[currentIndex + 1];
        if (
          state.progress.autoAdvanceNext &&
          nextStage &&
          currentIndex + 1 < state.progress.unlockedStageCount
        ) {
          c.pendingStageId = nextStage.id;
        }
      }
      fx.onStageClear?.();
      return;
    }
  }
  spawnCurrent(state);
}

function rollDrops(state: GameState, enemy: EnemyDef, fx: CombatFx): void {
  for (const d of enemy.drops) {
    if (Math.random() < d.chance) {
      const qty = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      const mult = d.noMultiplier ? 1 : materialDropMultiplier(state);
      const finalQty = Math.max(1, Math.round(qty * mult));
      if (finalQty > 0) {
        add(state, d.material, finalQty);
        fx.onDrop?.(d.material, finalQty);
      }
    }
  }
}

function heroDeath(state: GameState, fx: CombatFx): void {
  applyPendingLoadout(state); // ?唳???嚗銝?湔擛伐?憟?怠???嚗泵??
  const c = state.combat;
  if (inCreateTrial(state)) clearCreateTrialMaterials(state);
  c.waveIndex = 0;
  c.enemyIndex = 0;
  c.heroAtkTimer = 0;
  c.heroHp = deriveStats(state).hp;
  resetHeroEvolve(c); // 甇颱滿嚗?脣?撅斗甇賊
  fx.onHeroDied?.();
  spawnCurrent(state);
}

export function tickCombat(state: GameState, dt: number, fx: CombatFx): void {
  const c = state.combat;
  const createHealMachines = inCreateTrial(state) ? activeMachineCountByRecipe(state, "create_heal") : 0;
  const createDamageMachines = inCreateTrial(state) ? activeMachineCountByRecipe(state, "create_damage") : 0;
  if (c.clearPause > 0) {
    c.clearPause = Math.max(0, c.clearPause - dt);
    if (c.clearPause > 0) return;
    startStage(state, c.pendingStageId ?? c.stageId);
    fx.onStageClear?.();
    return;
  }
  const stats = deriveStats(state);
  const mut = mutationCombatEffects(state); // 霈閰?鈭??嚗??銵嚗?銵蝘?嚗axHpPct 撌脖蔥??stats.hp嚗?

  if (c.enemyHp <= 0) {
    spawnCurrent(state);
    if (c.enemyHp <= 0) return;
  }
  if (c.heroHp <= 0) c.heroHp = stats.hp;

  if (stats.hpRegen > 0 && c.heroHp > 0 && c.heroHp < stats.hp) {
    // 霈??銵蝘???? <50% ???? (1+??
    const regenMult = c.heroHp < stats.hp * 0.5 ? 1 + mut.lowHpRegenMult : 1;
    c.heroHp = Math.min(stats.hp, c.heroHp + stats.hpRegen * regenMult * dt);
  }
  if (createHealMachines > 0 && c.heroHp > 0 && c.heroHp < stats.hp) {
    c.heroHp = Math.min(stats.hp, c.heroHp + stats.hp * CREATE_HEAL_PER_MACHINE * createHealMachines * dt);
  }

  const enemy = currentEnemyDef(state);

  // 暺???瘥??儔?憭扯???靘?
  if (enemy.healPctPerSec && c.enemyHp > 0 && c.enemyHp < enemy.maxHp) {
    c.enemyHp = Math.min(enemy.maxHp, c.enemyHp + enemy.maxHp * enemy.healPctPerSec * dt);
  }
  const isCreateBoss = inCreateTrial(state) && c.waveIndex === 9 && c.enemyIndex === 0;
  if (isCreateBoss) {
    if (!c.createModeAnnounced) {
      fx.onNotice?.(createModeLabel(c.createMode));
      c.createModeAnnounced = true;
    }
    c.createModeTimer += dt;
    while (c.createModeTimer >= CREATE_MODE_DURATIONS[c.createMode]) {
      c.createModeTimer -= CREATE_MODE_DURATIONS[c.createMode];
      c.createMode = ((c.createMode + 1) % 3) as 0 | 1 | 2;
      fx.onNotice?.(createModeLabel(c.createMode));
    }
    if (c.createMode === 2 && c.enemyHp > 0 && c.enemyHp < enemy.maxHp) {
      c.enemyHp = Math.min(enemy.maxHp, c.enemyHp + enemy.maxHp * CREATE_REGEN_PCT * dt);
    }
  }
  // ?脣??蝙敺?瘥?5 蝘憚瘚?+20% ?? ?餅??蝳色??駁?蝝臬?嚗?
  if (enemy.evolve) {
    c.evolveTimer += dt;
    while (c.evolveTimer >= 5) {
      c.evolveTimer -= 5;
      if (c.evolveNext === 0) c.evolveAtk += 1;
      else if (c.evolveNext === 1) c.evolveDef += 1;
      else c.evolveSpd += 1;
      c.evolveNext = (c.evolveNext + 1) % 3;
    }
  }
  const eff = effectiveEnemy(c, enemy);

  // ?脣?蝚行?嚗?? 5 蝘憚瘚?+5% ?? ?餅??蝳色??駁?蝝臬?嚗楊瘜Ｖ???
  if (enemy.shield) {
    c.shieldTimer += dt;
    while (c.shieldTimer >= 5) {
      c.shieldTimer -= 5;
      c.shieldHp = enemy.shield;
      c.shieldBroken = false;
    }
  }
  const heroEvoRate = runeEvolveRate(state);
  if (activeRunes(state).includes("evolve")) {
    c.heroEvolveTimer += dt;
    while (c.heroEvolveTimer >= 5) {
      c.heroEvolveTimer -= 5;
      if (c.heroEvolveNext === 0) c.heroEvolveAtk += 1;
      else if (c.heroEvolveNext === 1) c.heroEvolveDef += 1;
      else c.heroEvolveSpd += 1;
      c.heroEvolveNext = (c.heroEvolveNext + 1) % 3;
    }
  }
  // ?芷?脣?蝚行??惜?豢???0嚗???evolveFactor ?? 1嚗??⊥?隞嗅??典??
  const heroDef = stats.def * evolveFactor(c.heroEvolveDef, heroEvoRate);

  // 銝甈∟???蝯??瑕拿嚗??銵嚗??單?行?畾箝?
  const heroHit = (): boolean => {
    if (isCreateBoss && c.createMode === 0) return false;
    const crit = Math.random() < stats.critChance;
    let atk = rollHeroAttack(stats) * evolveFactor(c.heroEvolveAtk, heroEvoRate);
    atk *= 1 + createDamageMachines * CREATE_DAMAGE_MORE_PER_MACHINE;
    if (isCreateBoss && c.createMode === 1) atk *= 1 - CREATE_ATTACK_MODE_DAMAGE_REDUCTION;
    if (crit) atk *= stats.critMult;
    const dmg = resolveHeroDamage(atk, eff.def, stats.defPenPct);
    fx.onHeroAttack?.(dmg, crit);
    if (crit && mut.critHealPct > 0) c.heroHp = Math.min(stats.hp, c.heroHp + stats.hp * mut.critHealPct);
    // 力量的使徒護盾：盾未破時傷害打在盾上、不傷本體；打破即停手
    if (enemy.shield && c.shieldHp > 0) {
      c.shieldHp -= dmg;
      if (c.shieldHp <= 0) { c.shieldHp = 0; c.shieldBroken = true; }
      return false;
    }
    c.enemyHp -= dmg;
    return c.enemyHp <= 0;
  };

  c.heroAtkTimer += dt;
  const interval = attackInterval(state, stats) / evolveFactor(c.heroEvolveSpd, heroEvoRate);
  while (c.heroAtkTimer >= interval && c.enemyHp > 0) {
    c.heroAtkTimer -= interval;
    let killed = heroHit();
    // 霈???????璈?餈賢?蝚砌???隞?10? ?漲嚗?銋??喉??
    if (!killed && mut.doubleStrikeChance > 0 && Math.random() < mut.doubleStrikeChance) killed = heroHit();
    if (killed) {
      rollDrops(state, enemy, fx);
      if (enemy.evolve) state.progress.apostleWins = (state.progress.apostleWins ?? 0) + 1;
      if (enemy.unlocksRune && !state.runes.owned.includes(enemy.unlocksRune)) state.runes.owned.push(enemy.unlocksRune); // ???脣??蝙敺?
      fx.onEnemyKilled?.(enemy.name);
      advance(state, fx);
      return;
    }
  }

  // 力量的使徒：破盾期間停止攻擊（並歸零計時，避免恢復後爆發）
  if (enemy.shield && c.shieldBroken) {
    c.enemyAtkTimer = 0;
    return;
  }
  let enemyAtkInterval = isCreateBoss && c.createMode === 1 ? eff.atkInterval / CREATE_ATTACK_SPEED_MULT : eff.atkInterval;
  // 失血狂暴（狼王）：每失去 enrageHpStep 生命，攻速 +enrageSpeedPct（間隔縮短）
  if (enemy.enrageHpStep && enemy.enrageSpeedPct) {
    const stacks = Math.floor(Math.max(0, enemy.maxHp - c.enemyHp) / enemy.enrageHpStep);
    enemyAtkInterval /= 1 + stacks * enemy.enrageSpeedPct;
  }
  c.enemyAtkTimer += dt;
  while (c.enemyAtkTimer >= enemyAtkInterval && c.heroHp > 0) {
    c.enemyAtkTimer -= enemyAtkInterval;
    const blocked = stats.blockChance > 0 && Math.random() < stats.blockChance;
    const reduction = Math.min(0.95, stats.dmgReductionPct + (blocked ? runeBlockReductionBonus(state) : 0));
    const edmg = resolveEnemyDamage(eff.atk, reduction, heroDef, enemy.defPenPct);
    c.heroHp -= edmg;
    fx.onEnemyAttack?.(edmg, blocked);
    if (c.heroHp <= 0) {
      heroDeath(state, fx);
      return;
    }
  }
}

