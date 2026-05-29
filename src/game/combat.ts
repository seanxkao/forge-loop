import type { GameState, EnemyDef, StageDef } from "./types.ts";
import { STAGES } from "./content.ts";
import { deriveStats, attackInterval } from "./hero.ts";
import { add } from "./inventory.ts";

/** 視覺/音效回呼。戰鬥邏輯只負責呼叫，由上層決定如何呈現。 */
export interface CombatFx {
  onHeroAttack?(dmg: number, crit: boolean): void; // 英雄打中敵人
  onEnemyAttack?(dmg: number, crit?: boolean): void; // 敵人打中英雄（crit：敵人暴擊）
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

/** 切換 / 開始一個關卡，從第一波重來，英雄回滿血。 */
export function startStage(state: GameState, stageId: string): void {
  const c = state.combat;
  c.stageId = stageId;
  c.waveIndex = 0;
  c.enemyIndex = 0;
  c.heroAtkTimer = 0;
  c.enemyAtkTimer = 0;
  c.heroHp = deriveStats(state).hp;
  spawnCurrent(state);
}

function spawnCurrent(state: GameState): void {
  state.combat.enemyHp = currentEnemyDef(state).maxHp;
  state.combat.enemyAtkTimer = 0;
}

/** 敵人死亡後推進到下一隻 / 下一波 / 關卡循環。 */
function advance(state: GameState, fx: CombatFx): void {
  const c = state.combat;
  const stage = getStage(c.stageId);
  c.enemyIndex++;
  if (c.enemyIndex >= stage.waves[c.waveIndex].length) {
    c.enemyIndex = 0;
    c.waveIndex++;
    if (c.waveIndex >= stage.waves.length) {
      // 通關 → 循環刷怪，回滿血
      c.waveIndex = 0;
      c.heroHp = deriveStats(state).hp;
      fx.onStageClear?.();
    }
  }
  spawnCurrent(state);
}

function rollDrops(state: GameState, enemy: EnemyDef, fx: CombatFx): void {
  for (const d of enemy.drops) {
    if (Math.random() < d.chance) {
      const qty = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (qty > 0) {
        add(state, d.material, qty);
        fx.onDrop?.(d.material, qty);
      }
    }
  }
}

function heroDeath(state: GameState, fx: CombatFx): void {
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
  const stats = deriveStats(state);

  // 確保有存活敵人
  if (c.enemyHp <= 0) {
    spawnCurrent(state);
    if (c.enemyHp <= 0) return;
  }
  // 載入後英雄血量未初始化
  if (c.heroHp <= 0) c.heroHp = stats.hp;

  // 每秒回血
  if (stats.hpRegen > 0 && c.heroHp > 0 && c.heroHp < stats.hp) {
    c.heroHp = Math.min(stats.hp, c.heroHp + stats.hpRegen * dt);
  }

  const enemy = currentEnemyDef(state);

  // 英雄攻擊：暴擊先乘暴傷，再減敵防禦
  c.heroAtkTimer += dt;
  const interval = attackInterval(stats);
  while (c.heroAtkTimer >= interval && c.enemyHp > 0) {
    c.heroAtkTimer -= interval;
    const crit = Math.random() < stats.critChance;
    let atk = stats.atk;
    if (crit) atk *= stats.critMult;
    const dmg = Math.max(1, Math.round(atk - enemy.def));
    c.enemyHp -= dmg;
    fx.onHeroAttack?.(dmg, crit);
    if (c.enemyHp <= 0) {
      rollDrops(state, enemy, fx);
      fx.onEnemyKilled?.(enemy.name);
      advance(state, fx);
      return;
    }
  }

  // 敵人攻擊：先乘算減傷、再減固定防禦、最後敵暴擊（受減暴傷承受削減）
  c.enemyAtkTimer += dt;
  while (c.enemyAtkTimer >= enemy.atkInterval && c.heroHp > 0) {
    c.enemyAtkTimer -= enemy.atkInterval;
    let base = enemy.atk * (1 - stats.dmgReductionPct);
    base -= stats.def;
    const ecritChance = enemy.critChance ?? 0;
    const ecrit = ecritChance > 0 && Math.random() < ecritChance;
    if (ecrit) {
      const effMult =
        1 + ((enemy.critMult ?? 1) - 1) * (1 - stats.critDmgTakenReductionPct);
      base *= effMult;
    }
    const edmg = Math.max(1, Math.round(base));
    c.heroHp -= edmg;
    fx.onEnemyAttack?.(edmg, ecrit);
    if (c.heroHp <= 0) {
      heroDeath(state, fx);
      return;
    }
  }
}
