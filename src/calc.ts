// Forge Loop 傷害計算器：建構真實 GameState → deriveStats → 共用 combat.ts 的傷害公式。
// 不複製公式：所有數值都走遊戲現行程式碼。
import { createInitialState } from "./game/state.ts";
import { deriveStats, attackInterval } from "./game/hero.ts";
import { resolveHeroDamage, resolveEnemyDamage } from "./game/combat.ts";
import { runeBlockReductionBonus, activeRunes, RUNE_DEFS, RUNE_STONES } from "./game/runes.ts";
import { mutationCombatEffects } from "./game/mutation.ts";
import { RECIPES, STAGES, TRIALS } from "./game/content.ts";
import { affixLabel } from "./game/affixMeta.ts";
import type { Affix, AffixDef, EnemyDef, Equipment, GameState, Slot, RuneId, RuneStoneId } from "./game/types.ts";

const AFFIX_ROWS = 4; // 每件最多列 4 條詞綴（普通／魔法用前 2、稀有用 4）

function slotDefs(slot: Slot): AffixDef[] {
  return RECIPES[slot].affixPool;
}

/** 由詞綴定義＋階級建一條詞（atk 取 min~max 區間，其餘取該階中位值；與 deriveStats 讀法一致）。 */
function makeAffix(def: AffixDef, tier: number): Affix {
  const t = def.tiers.find((x) => x.tier === tier) ?? def.tiers[def.tiers.length - 1];
  if (def.stat === "atk") {
    return { stat: def.stat, value: t.min, valueMax: t.max, label: def.label, pct: def.pct, tier: t.tier, tags: def.tags };
  }
  return { stat: def.stat, value: (t.min + t.max) / 2, label: def.label, pct: def.pct, tier: t.tier, tags: def.tags };
}

function buildEquip(uid: number, slot: Slot, specs: { stat: string; tier: number }[]): Equipment | null {
  if (specs.length === 0) return null;
  const recipe = RECIPES[slot];
  const affixes = specs.map((s) => makeAffix(recipe.affixPool.find((d) => d.stat === s.stat) ?? recipe.affixPool[0], s.tier));
  return {
    uid, recipeId: slot, name: recipe.name, icon: recipe.icon, kind: "equipment",
    rarity: "rare", locked: false, slot, base: { ...recipe.base }, affixes,
  };
}

interface Inputs {
  gear: Record<Slot, { stat: string; tier: number }[]> & { accessory2: { stat: string; tier: number }[] };
  affixResearch: number;
  baseResearch: number;
  currentHpPct: number;
  rune1: RuneId | "";
  rune2: RuneId | "";
  runeLevel: number;
  stone: RuneStoneId | "";
  enemy: { atk: number; def: number; defPenPct: number; atkInterval: number; hp: number };
}

function buildState(inp: Inputs): GameState {
  const state = createInitialState();
  state.equipped.weapon = buildEquip(1, "weapon", inp.gear.weapon);
  state.equipped.armor = buildEquip(2, "armor", inp.gear.armor);
  state.equipped.accessory = [
    buildEquip(3, "accessory", inp.gear.accessory),
    buildEquip(4, "accessory", inp.gear.accessory2),
  ];
  const stages: Record<string, number> = {};
  for (const eq of [state.equipped.weapon, state.equipped.armor, ...state.equipped.accessory]) {
    if (!eq) continue;
    for (const a of eq.affixes) stages[a.stat] = inp.affixResearch;
  }
  state.research.stages = stages;
  state.baseResearch = { weapon: inp.baseResearch, armor: inp.baseResearch, accessory: inp.baseResearch, core: inp.baseResearch };
  state.combat.researchMult = 1;
  const sel: RuneId[] = [];
  if (inp.rune1) sel.push(inp.rune1);
  if (inp.rune2 && inp.rune2 !== inp.rune1) sel.push(inp.rune2);
  state.runes.owned = Array.from(new Set([...state.runes.owned, ...sel]));
  state.runes.selected = sel;
  for (const id of sel) state.runes.levels[id] = inp.runeLevel;
  if (inp.stone) {
    state.runes.unlockedStones = [inp.stone];
    state.runes.selectedStone = inp.stone;
  }
  return state;
}

function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (Math.abs(n) >= 100) return `${Math.round(n)}`;
  return `${Math.round(n * 10) / 10}`;
}
function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

function compute(inp: Inputs): string {
  const state = buildState(inp);
  const stats = deriveStats(state);
  const maxHp = stats.hp;
  const curHp = Math.max(0, Math.min(maxHp, (inp.currentHpPct / 100) * maxHp));
  state.combat.heroHp = curHp; // 影響狂戰攻速（attackInterval 讀 heroHp）
  const aps = 1 / attackInterval(state, stats);
  const mut = mutationCombatEffects(state);
  const e = inp.enemy;

  // --- 玩家對敵人 ---
  const avgAtk = (stats.atkMin + stats.atkMax) / 2;
  const cc = Math.min(1, stats.critChance);
  const nonCrit = resolveHeroDamage(avgAtk, e.def, stats.defPenPct);
  const crit = resolveHeroDamage(avgAtk * stats.critMult, e.def, stats.defPenPct);
  const expHit = (1 - cc) * nonCrit + cc * crit;
  const dps = expHit * aps * (1 + mut.doubleStrikeChance);
  const ttk = dps > 0 ? e.hp / dps : Infinity;

  // --- 敵人對玩家 ---
  const blockBonus = runeBlockReductionBonus(state);
  const redNo = Math.min(0.95, stats.dmgReductionPct);
  const redBlk = Math.min(0.95, stats.dmgReductionPct + blockBonus);
  const hitNo = resolveEnemyDamage(e.atk, redNo, stats.def, e.defPenPct);
  const hitBlk = resolveEnemyDamage(e.atk, redBlk, stats.def, e.defPenPct);
  const bc = Math.min(1, stats.blockChance);
  const expTaken = (1 - bc) * hitNo + bc * hitBlk;
  const takenPerSec = expTaken / e.atkInterval;
  const regen = stats.hpRegen;
  const netPerSec = takenPerSec - regen;
  const surviveHits = expTaken > 0 ? curHp / expTaken : Infinity;
  const surviveSec = netPerSec > 0 ? curHp / netPerSec : Infinity;

  // 勝負：以當前血量開打，能否在被打死前先擊殺敵人
  const win = ttk <= surviveSec;

  const runeTxt = activeRunes(state).map((r) => RUNE_DEFS[r].name).join("、") || "無";

  return `
    <div class="res-block">
      <h2>玩家數據（deriveStats）</h2>
      <div class="res-line"><span>生命</span><b>${fmt(maxHp)}</b></div>
      <div class="res-line"><span>當前生命</span><span>${fmt(curHp)}（${inp.currentHpPct}%）</span></div>
      <div class="res-line"><span>攻擊</span><span>${fmt(stats.atkMin)}~${fmt(stats.atkMax)}（均 ${fmt(avgAtk)}）</span></div>
      <div class="res-line"><span>防禦</span><span>${fmt(stats.def)}</span></div>
      <div class="res-line"><span>暴擊率／暴傷</span><span>${pct(stats.critChance)} ／ ×${fmt(stats.critMult)}</span></div>
      <div class="res-line"><span>每秒攻擊</span><span>${fmt(aps)}（間隔 ${fmt(1 / aps)}s）</span></div>
      <div class="res-line"><span>減傷／格擋</span><span>${pct(stats.dmgReductionPct)} ／ ${pct(stats.blockChance)}</span></div>
      <div class="res-line"><span>秒回</span><span>${fmt(regen)}/s</span></div>
      <div class="res-line sub"><span>作用符文</span><span>${runeTxt}</span></div>
    </div>
    <div class="res-block">
      <h2>對敵輸出</h2>
      <div class="res-line"><span>普通命中</span><span>${fmt(nonCrit)}</span></div>
      <div class="res-line"><span>暴擊命中</span><span>${fmt(crit)}</span></div>
      <div class="res-line"><span>期望單擊</span><span>${fmt(expHit)}</span></div>
      <div class="res-line big"><span>DPS</span><b class="good">${fmt(dps)}</b></div>
      <div class="res-line"><span>擊殺敵人</span><b>${fmt(ttk)} 秒</b></div>
      ${mut.doubleStrikeChance > 0 ? `<div class="res-line sub"><span>含二連擊</span><span>${pct(mut.doubleStrikeChance)}</span></div>` : ""}
    </div>
    <div class="res-block">
      <h2>承受傷害</h2>
      <div class="res-line"><span>未格擋／格擋</span><span>${fmt(hitNo)} ／ ${fmt(hitBlk)}</span></div>
      <div class="res-line"><span>期望單擊</span><span>${fmt(expTaken)}</span></div>
      <div class="res-line"><span>每秒承受</span><span>${fmt(takenPerSec)}/s（淨 ${fmt(netPerSec)}/s）</span></div>
      <div class="res-line big"><span>可撐</span><b class="bad">${fmt(surviveHits)} 擊</b></div>
      <div class="res-line big"><span>可活</span><b class="bad">${fmt(surviveSec)} 秒</b></div>
    </div>
    <div class="verdict ${win ? "win" : "lose"}">${win ? "勝" : "敗"}</div>
    <div class="verdict-sub">擊殺 ${fmt(ttk)}s ${win ? "≤" : ">"} 可活 ${fmt(surviveSec)}s</div>`;
}

// ---------- UI ----------
function affRows(slot: Slot, group: string): string {
  const defs = slotDefs(slot);
  const opts = `<option value="">（無）</option>` + defs.map((d) => `<option value="${d.stat}">${affixLabel(d.stat)}</option>`).join("");
  let html = "";
  for (let i = 0; i < AFFIX_ROWS; i += 1) {
    html += `<div class="aff-row">
      <select data-g="${group}" data-i="${i}" data-k="stat">${opts}</select>
      <select data-g="${group}" data-i="${i}" data-k="tier">${[1, 2, 3, 4, 5, 6, 7, 8].map((t) => `<option value="${t}"${t === 8 ? " selected" : ""}>T${t}</option>`).join("")}</select>
    </div>`;
  }
  return html;
}

// 遊戲內所有敵人（章節＋試煉），供「敵人預設」下拉選用。
const ENEMY_REGISTRY: EnemyDef[] = [];
function enemyPresetHtml(): string {
  let html = `<option value="">（選擇遊戲敵人…）</option>`;
  for (const stage of [...STAGES, ...TRIALS]) {
    const seen = new Set<string>();
    const opts: string[] = [];
    for (const wave of stage.waves) {
      for (const en of wave) {
        if (seen.has(en.name)) continue;
        seen.add(en.name);
        const idx = ENEMY_REGISTRY.push(en) - 1;
        opts.push(`<option value="${idx}">${en.icon} ${en.name}（HP ${en.maxHp}）</option>`);
      }
    }
    if (opts.length) html += `<optgroup label="${stage.name}">${opts.join("")}</optgroup>`;
  }
  return html;
}

function runeOpts(): string {
  return `<option value="">（無）</option>` + (Object.keys(RUNE_DEFS) as RuneId[]).map((id) => `<option value="${id}">${RUNE_DEFS[id].name}</option>`).join("");
}
function stoneOpts(): string {
  return `<option value="">（無符石）</option>` + (Object.keys(RUNE_STONES) as RuneStoneId[]).map((id) => `<option value="${id}">${RUNE_STONES[id].name}</option>`).join("");
}

const root = document.getElementById("calc")!;
root.innerHTML = `
  <div class="calc-wrap">
    <div class="panel">
      <h2>玩家裝備</h2>
      <h2>武器</h2>${affRows("weapon", "weapon")}
      <h2>防具</h2>${affRows("armor", "armor")}
      <h2>飾品 1</h2>${affRows("accessory", "accessory")}
      <h2>飾品 2</h2>${affRows("accessory", "accessory2")}
    </div>
    <div class="panel">
      <h2>研究與符文</h2>
      <div class="row"><label>詞綴研究階</label><input type="number" id="affixRes" value="25" min="0" /></div>
      <div class="row"><label>基底研究階</label><input type="number" id="baseRes" value="25" min="0" /></div>
      <div class="row"><label>當前血量%</label><input type="number" id="hpPct" value="100" min="0" max="100" /></div>
      <div class="row"><label>符文 1</label><select id="rune1">${runeOpts()}</select></div>
      <div class="row"><label>符文 2</label><select id="rune2">${runeOpts()}</select></div>
      <div class="row"><label>符文等級</label><input type="number" id="runeLv" value="1" min="1" max="20" /></div>
      <div class="row"><label>符石</label><select id="stone">${stoneOpts()}</select></div>
      <h2>敵人</h2>
      <div class="row"><label>遊戲敵人</label><select id="enemyPreset">${enemyPresetHtml()}</select></div>
      <div class="row"><label>血量</label><input type="number" id="eHp" value="160000" /></div>
      <div class="row"><label>攻擊</label><input type="number" id="eAtk" value="900" /></div>
      <div class="row"><label>防禦</label><input type="number" id="eDef" value="0" /></div>
      <div class="row"><label>防禦穿透%</label><input type="number" id="eDefPen" value="0" min="0" max="100" /></div>
      <div class="row"><label>攻擊間隔s</label><input type="number" id="eInt" value="1" step="0.05" /></div>
    </div>
    <div class="panel" id="results"></div>
  </div>`;

function num(id: string): number {
  return Number((document.getElementById(id) as HTMLInputElement).value) || 0;
}
function readGear(group: string): { stat: string; tier: number }[] {
  const out: { stat: string; tier: number }[] = [];
  for (let i = 0; i < AFFIX_ROWS; i += 1) {
    const stat = (root.querySelector(`select[data-g="${group}"][data-i="${i}"][data-k="stat"]`) as HTMLSelectElement).value;
    if (!stat) continue;
    const tier = Number((root.querySelector(`select[data-g="${group}"][data-i="${i}"][data-k="tier"]`) as HTMLSelectElement).value);
    out.push({ stat, tier });
  }
  return out;
}

function refresh(): void {
  const inp: Inputs = {
    gear: {
      weapon: readGear("weapon"),
      armor: readGear("armor"),
      accessory: readGear("accessory"),
      accessory2: readGear("accessory2"),
    },
    affixResearch: num("affixRes"),
    baseResearch: num("baseRes"),
    currentHpPct: num("hpPct"),
    rune1: (document.getElementById("rune1") as HTMLSelectElement).value as RuneId | "",
    rune2: (document.getElementById("rune2") as HTMLSelectElement).value as RuneId | "",
    runeLevel: num("runeLv"),
    stone: (document.getElementById("stone") as HTMLSelectElement).value as RuneStoneId | "",
    enemy: { atk: num("eAtk"), def: num("eDef"), defPenPct: num("eDefPen") / 100, atkInterval: num("eInt") || 1, hp: num("eHp") },
  };
  document.getElementById("results")!.innerHTML = compute(inp);
}

// 選遊戲敵人預設 → 填入敵人欄位（之後仍可手動微調）
(document.getElementById("enemyPreset") as HTMLSelectElement).addEventListener("change", (ev) => {
  const idx = Number((ev.target as HTMLSelectElement).value);
  const en = ENEMY_REGISTRY[idx];
  if (!en) return;
  (document.getElementById("eHp") as HTMLInputElement).value = `${en.maxHp}`;
  (document.getElementById("eAtk") as HTMLInputElement).value = `${en.atk}`;
  (document.getElementById("eDef") as HTMLInputElement).value = `${en.def}`;
  (document.getElementById("eDefPen") as HTMLInputElement).value = `${Math.round((en.defPenPct ?? 0) * 100)}`;
  (document.getElementById("eInt") as HTMLInputElement).value = `${en.atkInterval}`;
  refresh();
});

root.addEventListener("input", refresh);
root.addEventListener("change", refresh);
refresh();
