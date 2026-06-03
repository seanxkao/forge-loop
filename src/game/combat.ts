import type { GameState, EnemyDef, StageDef } from "./types.ts";
import { STAGES, findStage } from "./content.ts";
import { deriveStats, attackInterval } from "./hero.ts";
import { add } from "./inventory.ts";
import { materialDropMultiplier } from "./reincarnation.ts";
import { runeBlockReductionBonus, RUNE_EVOLVE_RATE } from "./runes.ts";
import { coerceUnlockedStageId, unlockAfterStageClear } from "./unlocks.ts";
import { grantLegendaryCoreReward } from "./legendaryCores.ts";
import { applyPendingLoadout } from "./loadout.ts";
import { applyTrialReward, type TrialResult } from "./research.ts";
import { mutationCombatEffects } from "./mutation.ts";

function effectiveDefense(defense: number, penPct: number): number {
  const pen = Math.max(0, Math.min(1, penPct));
  return defense * (1 - pen);
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
}

export function getStage(stageId: string): StageDef {
  return findStage(stageId) ?? STAGES[0];
}

/** 進化的使徒每層進化比率。 */
export const ENEMY_EVOLVE_RATE = 0.20;

/** 進化某一維度（攻／防／攻速）的倍率：累加 stacks 層、每層 rate。比率為輸入，敵人／英雄共用。 */
function evolveFactor(stacks: number, rate: number): number {
  return 1 + rate * stacks;
}

/** 進化的使徒：依累加層數算出敵人「有效」數值（攻速＝間隔縮短）。 */
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

/** 進化符文：歸零英雄進化層數（死亡／換關時呼叫；跨波不重置）。 */
function resetHeroEvolve(c: GameState["combat"]): void {
  c.heroEvolveTimer = 0;
  c.heroEvolveAtk = 0;
  c.heroEvolveDef = 0;
  c.heroEvolveSpd = 0;
  c.heroEvolveNext = 0;
}

export function startStage(state: GameState, stageId: string): void {
  applyPendingLoadout(state); // 下場戰鬥開始：套用戰鬥中暫存的換裝／符文
  const c = state.combat;
  c.stageId = coerceUnlockedStageId(state, stageId);
  c.researchMult = getStage(c.stageId).researchMult ?? 1;
  c.waveIndex = 0;
  c.enemyIndex = 0;
  c.heroAtkTimer = 0;
  c.enemyAtkTimer = 0;
  c.clearPause = 0;
  c.pendingStageId = null;
  resetEvolve(c);
  resetHeroEvolve(c);
  c.heroHp = deriveStats(state).hp;
  spawnCurrent(state);
}

function spawnCurrent(state: GameState): void {
  state.combat.enemyHp = currentEnemyDef(state).maxHp;
  state.combat.enemyAtkTimer = 0;
  resetEvolve(state.combat); // 每波重置進化層數（使徒出場時從 0 起算）
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
        // 試煉：解鎖進化符文＋套用研究折扣＋重算等級＋退還剩餘，並重玩（可重複刷）
        if (!state.runes.owned.includes("evolve")) state.runes.owned.push("evolve");
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
  applyPendingLoadout(state); // 戰敗重來＝新一場戰鬥：套用暫存換裝／符文
  const c = state.combat;
  c.waveIndex = 0;
  c.enemyIndex = 0;
  c.heroAtkTimer = 0;
  c.heroHp = deriveStats(state).hp;
  resetHeroEvolve(c); // 死亡：英雄進化層數歸零
  fx.onHeroDied?.();
  spawnCurrent(state);
}

export function tickCombat(state: GameState, dt: number, fx: CombatFx): void {
  const c = state.combat;
  if (c.clearPause > 0) {
    c.clearPause = Math.max(0, c.clearPause - dt);
    if (c.clearPause > 0) return;
    startStage(state, c.pendingStageId ?? c.stageId);
    fx.onStageClear?.();
    return;
  }
  const stats = deriveStats(state);
  const mut = mutationCombatEffects(state); // 變異詞：二連擊／暴擊回血／低血秒回（maxHpPct 已併入 stats.hp）

  if (c.enemyHp <= 0) {
    spawnCurrent(state);
    if (c.enemyHp <= 0) return;
  }
  if (c.heroHp <= 0) c.heroHp = stats.hp;

  if (stats.hpRegen > 0 && c.heroHp > 0 && c.heroHp < stats.hp) {
    // 變異「低血秒回」：生命 <50% 時秒回乘 (1+量)
    const regenMult = c.heroHp < stats.hp * 0.5 ? 1 + mut.lowHpRegenMult : 1;
    c.heroHp = Math.min(stats.hp, c.heroHp + stats.hpRegen * regenMult * dt);
  }

  const enemy = currentEnemyDef(state);

  // 黃金王：每秒回復最大血量比例
  if (enemy.healPctPerSec && c.enemyHp > 0 && c.enemyHp < enemy.maxHp) {
    c.enemyHp = Math.min(enemy.maxHp, c.enemyHp + enemy.maxHp * enemy.healPctPerSec * dt);
  }
  // 進化的使徒：每 5 秒輪流 +20% 原始 攻擊→防禦→攻速（累加）
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

  // 進化符文：英雄每 5 秒輪流 +5% 原始 攻擊→防禦→攻速（累加，跨波保留）
  if (state.runes.selected === "evolve") {
    c.heroEvolveTimer += dt;
    while (c.heroEvolveTimer >= 5) {
      c.heroEvolveTimer -= 5;
      if (c.heroEvolveNext === 0) c.heroEvolveAtk += 1;
      else if (c.heroEvolveNext === 1) c.heroEvolveDef += 1;
      else c.heroEvolveSpd += 1;
      c.heroEvolveNext = (c.heroEvolveNext + 1) % 3;
    }
  }
  // 未選進化符文時層數恆為 0，下列 evolveFactor 皆回 1，故無條件套用即可
  const heroDef = stats.def * evolveFactor(c.heroEvolveDef, RUNE_EVOLVE_RATE);

  // 一次英雄攻擊：結算傷害＋暴擊回血，回傳是否擊殺。
  const heroHit = (): boolean => {
    const crit = Math.random() < stats.critChance;
    let atk = rollHeroAttack(stats) * evolveFactor(c.heroEvolveAtk, RUNE_EVOLVE_RATE);
    if (crit) atk *= stats.critMult;
    const dmg = Math.max(1, Math.round(atk - effectiveDefense(eff.def, stats.defPenPct)));
    c.enemyHp -= dmg;
    fx.onHeroAttack?.(dmg, crit);
    if (crit && mut.critHealPct > 0) c.heroHp = Math.min(stats.hp, c.heroHp + stats.hp * mut.critHealPct);
    return c.enemyHp <= 0;
  };

  c.heroAtkTimer += dt;
  const interval = attackInterval(state, stats) / evolveFactor(c.heroEvolveSpd, RUNE_EVOLVE_RATE);
  while (c.heroAtkTimer >= interval && c.enemyHp > 0) {
    c.heroAtkTimer -= interval;
    let killed = heroHit();
    // 變異「二連擊」：機率追加第二擊，以 10× 速度（近乎立即）打出
    if (!killed && mut.doubleStrikeChance > 0 && Math.random() < mut.doubleStrikeChance) killed = heroHit();
    if (killed) {
      rollDrops(state, enemy, fx);
      if (enemy.evolve) state.progress.apostleWins = (state.progress.apostleWins ?? 0) + 1; // 擊敗進化的使徒
      fx.onEnemyKilled?.(enemy.name);
      advance(state, fx);
      return;
    }
  }

  c.enemyAtkTimer += dt;
  while (c.enemyAtkTimer >= eff.atkInterval && c.heroHp > 0) {
    c.enemyAtkTimer -= eff.atkInterval;
    const blocked = stats.blockChance > 0 && Math.random() < stats.blockChance;
    const reduction = Math.min(0.95, stats.dmgReductionPct + (blocked ? runeBlockReductionBonus(state) : 0));
    let base = eff.atk * (1 - reduction);
    base -= effectiveDefense(heroDef, enemy.defPenPct);
    const edmg = Math.max(1, Math.round(base));
    c.heroHp -= edmg;
    fx.onEnemyAttack?.(edmg, blocked);
    if (c.heroHp <= 0) {
      heroDeath(state, fx);
      return;
    }
  }
}
