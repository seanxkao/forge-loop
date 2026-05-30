import type { GameState } from "../game/types.ts";
import { currentEnemyDef, getStage } from "../game/combat.ts";
import { deriveStats } from "../game/hero.ts";

interface Popup {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  driftX: number;
  rise: number;
  text: string;
  color: string;
  life: number; // 剩餘秒數
  totalLife: number;
  big: boolean;
}

interface PendingDrop {
  text: string;
  delay: number;
}

const W = 480;
const H = 240;
const GROUND_Y = 166;
const HERO_X = 110;
const ENEMY_X = 360;

export class BattleRenderer {
  private ctx: CanvasRenderingContext2D;
  private popups: Popup[] = [];
  private pendingDrops: PendingDrop[] = [];
  private heroLunge = 0;
  private enemyLunge = 0;
  private heroFlash = 0;
  private enemyFlash = 0;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  heroAttacked(dmg: number, crit: boolean): void {
    this.heroLunge = 1;
    this.enemyFlash = 1;
    this.popups.push({
      x: ENEMY_X,
      y: GROUND_Y - 60,
      baseX: ENEMY_X,
      baseY: GROUND_Y - 60,
      driftX: 0,
      rise: 28,
      text: crit ? `${dmg}!` : `${dmg}`,
      color: crit ? "#ffd23f" : "#ffffff",
      life: 0.9,
      totalLife: 0.9,
      big: crit,
    });
  }

  enemyAttacked(dmg: number, blocked = false): void {
    this.enemyLunge = 1;
    this.heroFlash = 1;
    this.popups.push({
      x: HERO_X,
      y: GROUND_Y - 60,
      baseX: HERO_X,
      baseY: GROUND_Y - 60,
      driftX: 0,
      rise: 28,
      text: `${blocked ? "🛡 " : ""}${dmg}`,
      color: blocked ? "rgba(255, 92, 92, 0.68)" : "#ff5c5c",
      life: 0.9,
      totalLife: 0.9,
      big: false,
    });
  }

  drop(text: string): void {
    this.pendingDrops.push({
      text,
      delay: this.pendingDrops.length * 0.1,
    });
  }

  draw(state: GameState): void {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.1) dt = 0.1;

    // 衰減動畫計時
    this.heroLunge = Math.max(0, this.heroLunge - dt * 5);
    this.enemyLunge = Math.max(0, this.enemyLunge - dt * 5);
    this.heroFlash = Math.max(0, this.heroFlash - dt * 6);
    this.enemyFlash = Math.max(0, this.enemyFlash - dt * 6);
    for (const drop of this.pendingDrops) drop.delay -= dt;
    while (this.pendingDrops[0] && this.pendingDrops[0].delay <= 0) {
      const next = this.pendingDrops.shift()!;
      const driftX = (Math.random() - 0.5) * 28;
      this.popups.push({
        x: ENEMY_X,
        y: GROUND_Y - 90,
        baseX: ENEMY_X,
        baseY: GROUND_Y - 90,
        driftX,
        rise: 42,
        text: next.text,
        color: "#7CFC9B",
        life: 1.2,
        totalLife: 1.2,
        big: false,
      });
    }

    const ctx = this.ctx;
    // 背景
    ctx.fillStyle = "#15131f";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#211d31";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    // 地面紋理
    ctx.fillStyle = "#2c2740";
    for (let x = 0; x < W; x += 16) ctx.fillRect(x, GROUND_Y, 8, 4);

    const stage = getStage(state.combat.stageId);
    const enemy = currentEnemyDef(state);
    const stats = deriveStats(state);

    // 關卡與波次標題
    ctx.fillStyle = "#8a83a8";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${stage.name}　第 ${state.combat.waveIndex + 1}/${stage.waves.length} 波`,
      W / 2,
      24,
    );

    // 英雄
    const heroDx = this.heroLunge * 14;
    this.drawHero(HERO_X + heroDx, GROUND_Y, this.heroFlash > 0.5);
    this.drawBar(
      HERO_X - 26,
      GROUND_Y - 86,
      52,
      6,
      state.combat.heroHp / Math.max(1, stats.hp),
      "#4caf50",
    );

    // 敵人
    const enemyDx = -this.enemyLunge * 14;
    this.drawEnemy(ENEMY_X + enemyDx, GROUND_Y, enemy.icon, this.enemyFlash > 0.5);
    this.drawBar(
      ENEMY_X - 26,
      GROUND_Y - 86,
      52,
      6,
      state.combat.enemyHp / Math.max(1, enemy.maxHp),
      "#e2574c",
    );
    ctx.fillStyle = "#cfc8e8";
    ctx.font = "10px monospace";
    ctx.fillText(enemy.name, ENEMY_X, GROUND_Y + 18);

    // 傷害數字
    for (const p of this.popups) {
      p.life -= dt;
      const progress = 1 - Math.max(0, p.life) / p.totalLife;
      const eased = 1 - (1 - progress) ** 3;
      p.x = p.baseX + p.driftX * eased;
      p.y = p.baseY - p.rise * eased;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.totalLife));
      ctx.fillStyle = p.color;
      ctx.font = `${p.big ? 18 : 13}px monospace`;
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  /** 方塊拼的小騎士，面向右。 */
  private drawHero(cx: number, groundY: number, flash: boolean): void {
    const ctx = this.ctx;
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = flash ? "#ffffff" : c;
      ctx.fillRect(Math.round(cx + x), Math.round(groundY + y), w, h);
    };
    // 腿
    px(-10, -12, 6, 12, "#3b4a8a");
    px(-2, -12, 6, 12, "#3b4a8a");
    // 身體
    px(-12, -34, 18, 24, "#5066c0");
    // 頭盔
    px(-10, -48, 14, 14, "#9aa6e0");
    px(-10, -42, 14, 4, "#2b3566"); // 面甲縫
    // 劍（右手）
    px(8, -40, 4, 26, "#d9d9e6");
    px(6, -16, 8, 4, "#8a6b3a"); // 護手
  }

  /** 敵人用放大圖示呈現，腳下加陰影。 */
  private drawEnemy(cx: number, groundY: number, icon: string, flash: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 2, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = "48px serif";
    if (flash) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillText(icon, cx, groundY - 6);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(cx - 26, groundY - 52, 52, 52);
      ctx.restore();
    } else {
      ctx.fillText(icon, cx, groundY - 6);
    }
  }

  private drawBar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    color: string,
  ): void {
    const ctx = this.ctx;
    const r = Math.max(0, Math.min(1, ratio));
    ctx.fillStyle = "#000000";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = "#3a3550";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.round(w * r), h);
  }
}
