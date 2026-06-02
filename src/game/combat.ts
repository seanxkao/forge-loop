import type { GameState, EnemyDef, StageDef } from "./types.ts";
import { STAGES } from "./content.ts";
import { deriveStats, attackInterval } from "./hero.ts";
import { add } from "./inventory.ts";
import { materialDropMultiplier } from "./reincarnation.ts";
import { runeBlockReductionBonus } from "./runes.ts";
import { coerceUnlockedStageId, unlockAfterStageClear } from "./unlocks.ts";
import { grantLegendaryCoreReward } from "./legendaryCores.ts";
import { applyPendingLoadout } from "./loadout.ts";

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
}

export function getStage(stageId: string): StageDef {
  return STAGES.find((s) => s.id === stageId) ?? STAGES[0];
}

export function currentEnemyDef(state: GameState): EnemyDef {
  const stage = getStage(state.combat.stageId);
  const wave = stage.waves[state.combat.waveIndex] ?? stage.waves[0];
  return wave[state.combat.enemyIndex] ?? wave[0];
}

export function startStage(state: GameState, stageId: string): void {
  applyPendingLoadout(state); // 下場戰鬥開始：套用戰鬥中暫存的換裝／符文
  const c = state.combat;
  c.stageId = coerceUnlockedStageId(state, stageId);
  c.waveIndex = 0;
  c.enemyIndex = 0;
  c.heroAtkTimer = 0;
  c.enemyAtkTimer = 0;
  c.clearPause = 0;
  c.pendingStageId = null;
  c.heroHp = deriveStats(state).hp;
  spawnCurrent(state);
}

function spawnCurrent(state: GameState): void {
  state.combat.enemyHp = currentEnemyDef(state).maxHp;
  state.combat.enemyAtkTimer = 0;
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
      unlockAfterStageClear(state, stageId);
      grantLegendaryCoreReward(state, stageId);
      c.waveIndex = 0;
      c.heroHp = deriveStats(state).hp;
      c.heroAtkTimer = 0;
      c.enemyAtkTimer = 0;
      c.clearPause = 1;
      c.pendingStageId = null;
      c.enemyHp = 0;
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
      const finalQty = Math.max(1, Math.round(qty * materialDropMultiplier(state)));
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

  if (c.enemyHp <= 0) {
    spawnCurrent(state);
    if (c.enemyHp <= 0) return;
  }
  if (c.heroHp <= 0) c.heroHp = stats.hp;

  if (stats.hpRegen > 0 && c.heroHp > 0 && c.heroHp < stats.hp) {
    c.heroHp = Math.min(stats.hp, c.heroHp + stats.hpRegen * dt);
  }

  const enemy = currentEnemyDef(state);

  c.heroAtkTimer += dt;
  const interval = attackInterval(state, stats);
  while (c.heroAtkTimer >= interval && c.enemyHp > 0) {
    c.heroAtkTimer -= interval;
    const crit = Math.random() < stats.critChance;
    let atk = rollHeroAttack(stats);
    if (crit) atk *= stats.critMult;
    const dmg = Math.max(1, Math.round(atk - effectiveDefense(enemy.def, stats.defPenPct)));
    c.enemyHp -= dmg;
    fx.onHeroAttack?.(dmg, crit);
    if (c.enemyHp <= 0) {
      rollDrops(state, enemy, fx);
      fx.onEnemyKilled?.(enemy.name);
      advance(state, fx);
      return;
    }
  }

  c.enemyAtkTimer += dt;
  while (c.enemyAtkTimer >= enemy.atkInterval && c.heroHp > 0) {
    c.enemyAtkTimer -= enemy.atkInterval;
    const blocked = stats.blockChance > 0 && Math.random() < stats.blockChance;
    const reduction = Math.min(0.95, stats.dmgReductionPct + (blocked ? runeBlockReductionBonus(state) : 0));
    let base = enemy.atk * (1 - reduction);
    base -= effectiveDefense(stats.def, enemy.defPenPct);
    const edmg = Math.max(1, Math.round(base));
    c.heroHp -= edmg;
    fx.onEnemyAttack?.(edmg, blocked);
    if (c.heroHp <= 0) {
      heroDeath(state, fx);
      return;
    }
  }
}
