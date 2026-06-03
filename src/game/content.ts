// 靜態遊戲內容（雛型數值，待實測平衡）
import type {
  MaterialDef,
  StageDef,
  EnemyDef,
  DropDef,
  RecipeDef,
  RecipeId,
  StatBlock,
  Slot,
} from "./types.ts";
import { affixPool } from "./affixTable.ts";
import { CORE_RECIPE, MATERIAL_DROP_AFFIX } from "./coreContent.ts";

/** 英雄裸值（無裝備，極弱）。 */
export const HERO_BASE: StatBlock = {
  hp: 50,
  atkMin: 7,
  atkMax: 7,
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

/** 英雄基礎攻擊間隔（秒），實際間隔 = 此值 / (1 + haste)。 */
export const HERO_BASE_INTERVAL = 1.2;

/** 製裝詞綴數量權重（index 0 = 1 條 … index 3 = 4 條）。待平衡。 */
export const GRID_WIDTH = 3;
export const GRID_HEIGHT = 3;

// ---- 素材：3 種，各對應一槽（1 原始 + 1 中間 + 1 機台），無階級 ----

export const MATERIALS: Record<string, MaterialDef> = {
  ore: { id: "ore", name: "礦石", kind: "raw", icon: "🪨" },
  shard: { id: "shard", name: "晶石", kind: "raw", icon: "🔹" },
  ingot: { id: "ingot", name: "金屬錠", kind: "intermediate", icon: "🟧" },
  crystal: { id: "crystal", name: "精晶", kind: "intermediate", icon: "💠" },
  // 突變原：變異工藝的消耗通貨，僅進化試煉產出（黃金王 1、進化的使徒 2），不受素材掉落倍率影響。
  mutagen: { id: "mutagen", name: "突變原", kind: "intermediate", icon: "🧫" },
};

// ---- 裝備：3 槽各一固定基底，詞綴池見 affixTable.csv（成本／基底待平衡） ----

export const RECIPES: Record<string, RecipeDef> = {
  weapon: {
    id: "weapon",
    name: "劍",
    icon: "🗡️",
    slot: "weapon",
    cost: { ingot: 3 },
    base: { atkMin: 18, atkMax: 22 },
    affixPool: affixPool("weapon"),
  },
  armor: {
    id: "armor",
    name: "甲",
    icon: "🛡️",
    slot: "armor",
    cost: { ingot: 4 },
    base: { hp: 80, def: 3 },
    affixPool: affixPool("armor"),
  },
  accessory: {
    id: "accessory",
    name: "護符",
    icon: "💍",
    slot: "accessory",
    cost: { crystal: 2 },
    base: { critChance: 0.05 },
    affixPool: [...affixPool("accessory"), MATERIAL_DROP_AFFIX],
  },
};

export { CORE_RECIPE };

// ---- 統一配方註冊表：組裝機可指定的所有配方（提煉／裝備／核心／機台自身） ----

export type RecipeKind = "refine" | "equipment" | "core" | "assembler" | "lab" | "dismantler";

export interface ProdRecipeDef {
  id: RecipeId;
  name: string;
  icon: string;
  kind: RecipeKind;
  input: Record<string, number>;
  output?: Record<string, number>; // 僅 refine 用（產素材）
  cycleTime: number;
  slot?: Slot; // equipment 用
  /** 解鎖條件：start＝開局；zone1＝通關 1-4 後；core＝通關 2-4 後。 */
  unlock: "start" | "zone1" | "core";
}

/** 組裝機建造成本：直接吃三種原料（開局靠掉落即可加開）。研究室吃中間材料。待平衡。 */
export const ASSEMBLER_COST: Record<string, number> = { ore: 16, shard: 8 };
export const LAB_COST: Record<string, number> = { ingot: 16, crystal: 8 };

export const PROD_RECIPES: Record<RecipeId, ProdRecipeDef> = {
  smelt: { id: "smelt", name: "熔煉", icon: "🔥", kind: "refine", input: { ore: 2 }, output: { ingot: 1 }, cycleTime: 6, unlock: "start" },
  crystallize: { id: "crystallize", name: "晶化", icon: "⚗️", kind: "refine", input: { shard: 2 }, output: { crystal: 1 }, cycleTime: 6, unlock: "zone1" },
  weapon: { id: "weapon", name: "武器", icon: RECIPES.weapon.icon, kind: "equipment", slot: "weapon", input: RECIPES.weapon.cost, cycleTime: 4, unlock: "start" },
  armor: { id: "armor", name: "防具", icon: RECIPES.armor.icon, kind: "equipment", slot: "armor", input: RECIPES.armor.cost, cycleTime: 4, unlock: "start" },
  accessory: { id: "accessory", name: "飾品", icon: RECIPES.accessory.icon, kind: "equipment", slot: "accessory", input: RECIPES.accessory.cost, cycleTime: 4, unlock: "zone1" },
  core: { id: "core", name: "核心", icon: CORE_RECIPE.icon, kind: "core", input: CORE_RECIPE.cost, cycleTime: 8, unlock: "core" },
  assembler: { id: "assembler", name: "組裝機", icon: "🛠️", kind: "assembler", input: ASSEMBLER_COST, cycleTime: 3, unlock: "start" },
  lab: { id: "lab", name: "研究室", icon: "🔬", kind: "lab", input: LAB_COST, cycleTime: 3, unlock: "start" },
  dismantler: { id: "dismantler", name: "拆解機", icon: "🪓", kind: "dismantler", input: LAB_COST, cycleTime: 3, unlock: "start" },
};

// ---- 關卡：20 關，5 區 × 4 關（第 4 關為魔王） ----

const RAWS = ["ore", "shard"]; // 兩種素材所有關卡都掉
const ZONE = [
  { area: "礦坑帶", enemy: "史萊姆", icon: "🟢", boss: "史萊姆王" },
  { area: "荒野帶", enemy: "野狼", icon: "🐺", boss: "狼王" },
  { area: "晶洞帶", enemy: "晶化魔像", icon: "🗿", boss: "魔像核心" },
  { area: "鐵域帶", enemy: "鋼鐵魔偶", icon: "🤖", boss: "鋼鐵霸主" },
  { area: "虛空帶", enemy: "虛空獸", icon: "👾", boss: "虛空之王" },
];
const STAGE_NAMES = [
  "廢棄礦坑", "坍方坑道", "銅脈深處", "礦坑核心",
  "枯狼林", "野獸平原", "巨獸棲地", "荒野盡頭",
  "碎晶洞", "微晶迴廊", "晶簇深淵", "共鳴晶核",
  "廢鐵堡", "熔鐵工廠", "鋼鐵巢穴", "鐵王座",
  "虛空裂隙", "崩界回廊", "虛晶聖所", "虛空之心",
];

// 每區 4 關的一般敵人數值（待平衡）。詞綴改為「非重疊分階」後平均約 +27% 強、
// 天花板更高，故在前次基礎上再 HP/ATK ×1.3 反映。
const E_HP = [
  [36, 58, 88, 124],
  [218, 274, 328, 400],
  [624, 748, 894, 1060],
  [1592, 1872, 2200, 2574],
  [3744, 4420, 5200, 6136],
];
const E_ATK = [
  [3, 5, 7, 8],
  [17, 20, 23, 27],
  [35, 39, 46, 52],
  [70, 82, 94, 108],
  [135, 156, 182, 208],
];
const E_DEF = [
  [0, 2, 2, 4],
  [4, 6, 6, 8],
  [10, 12, 14, 16],
  [18, 22, 26, 30],
  [36, 42, 48, 56],
];
const Z_INTERVAL = [1.4, 1.3, 1.25, 1.2, 1.15];

// 魔王數值：直接指定，與一般敵人曲線解耦，方便獨立調整（逐區加碼抵銷生產雪球；待平衡）
const BOSS_HP = [468, 2912, 4160, 22464, 49200];
const BOSS_ATK = [13, 21.6, 83, 220, 180];
const BOSS_INTERVAL = [1.4, 0.65, 1.25, 1.8, 0.95];

/** 三種素材全掉，量隨關卡編號指數上升（後期數量級暴增）；魔王 ×10。待平衡。 */
function buildDrops(stageIndex: number, isBoss: boolean): DropDef[] {
  const base = Math.max(1, Math.round(1.6 ** stageIndex));
  const m = base * (isBoss ? 10 : 1);
  return RAWS.map((mat) => {
    const qty = mat === "ore" ? m * 2 : m;
    return { material: mat, min: qty, max: qty * 2, chance: 1 };
  });
}

function makeWaves(
  waveCount: number,
  enemy: EnemyDef,
  enemiesPerWave: number,
): EnemyDef[][] {
  const waves: EnemyDef[][] = [];
  for (let w = 0; w < waveCount; w++) {
    const wave: EnemyDef[] = [];
    for (let e = 0; e < enemiesPerWave; e++) wave.push({ ...enemy });
    waves.push(wave);
  }
  return waves;
}

function buildStages(): StageDef[] {
  const stages: StageDef[] = [];
  for (let i = 0; i < 20; i++) {
    const z = Math.floor(i / 4);
    const sub = i % 4;
    const isBoss = sub === 3;

    const normal: EnemyDef = {
      name: ZONE[z].enemy,
      icon: ZONE[z].icon,
      maxHp: E_HP[z][sub],
      atk: E_ATK[z][sub],
      def: E_DEF[z][sub],
      defPenPct: 0,
      atkInterval: Z_INTERVAL[z],
      drops: buildDrops(i, false),
    };

    let waves: EnemyDef[][];
    if (isBoss) {
      const boss: EnemyDef = {
        name: `💀 ${ZONE[z].boss}`,
        icon: ZONE[z].icon,
        maxHp: BOSS_HP[z],
        atk: BOSS_ATK[z],
        def: E_DEF[z][3],
        defPenPct: z === 1 ? 0.5 : 0,
        atkInterval: BOSS_INTERVAL[z],
        drops: buildDrops(i, true),
      };
      // 前 4 波雜兵暖身（各 1 隻）＋ 第 5 波單一魔王
      waves = makeWaves(4, normal, 1);
      waves.push([boss]);
    } else {
      waves = makeWaves(5, normal, 1);
    }

    stages.push({
      id: `s${i + 1}`,
      name: `${i + 1}. ${STAGE_NAMES[i]}`,
      desc: `${ZONE[z].area} · 難度 ${i + 1}／20${isBoss ? "（魔王）" : ""}`,
      waves,
    });
  }
  return stages;
}

export const STAGES: StageDef[] = buildStages();

// ---- 終局：試煉關（地圖「試煉」分頁；數值集中於此，便於調整）----
// 數值依 1~20 關成長幅度外推到「第 24 關」：每階約 HP×1.31／ATK×1.25／DEF×1.20，
// 第 24 關＝第 20 關 +4 階（HP×2.95、ATK×2.44、DEF×2.09）。錨點：一般怪 E_*[4][3]＝6136/208/56、尾王 BOSS_*[4]＝49200/180。
const TRIAL_MOB: EnemyDef = {
  name: "改造獸", icon: "🧬",
  maxHp: 18000, atk: 460, def: 117,
  defPenPct: 0, atkInterval: 1.15, drops: [],
};
const TRIAL_GOLD_KING: EnemyDef = {
  name: "👑 黃金王", icon: "👑",
  maxHp: 36000, atk: 460, def: 117,
  defPenPct: 0, atkInterval: 1.0,
  drops: [{ material: "mutagen", min: 1, max: 1, chance: 1, noMultiplier: true }],
  healPctPerSec: 0.03,
};
const TRIAL_APOSTLE: EnemyDef = {
  name: "💀 進化的使徒", icon: "🧬",
  maxHp: 145000, atk: 390, def: 120,
  defPenPct: 0, atkInterval: 0.95,
  drops: [{ material: "mutagen", min: 2, max: 2, chance: 1, noMultiplier: true }],
  evolve: true,
};
// 記憶試煉專屬敵人：數值暫沿用進化試煉的複製，名稱／icon 依 lore 改寫，待設計專屬機制與數值。
const MEMORY_MOB: EnemyDef = {
  name: "復甦戰士", icon: "🧟",
  maxHp: 600, atk: 50, def: 25,
  defPenPct: 0, atkInterval: 1.15, drops: [],
};
// 無名（高攻速）：暫沿用黃金王數值，但移除回血技能（回血屬進化試煉的黃金王，與無名 lore 矛盾）。高攻速／龜向待設計。
const MEMORY_NAMELESS: EnemyDef = {
  name: "👤 無名", icon: "👤",
  maxHp: 1800, atk: 60, def: 25,
  defPenPct: 0, atkInterval: 1.0, drops: [],
};
// 記憶的使徒：複製自進化的使徒、無進化 buff（純數值對拚）。
const MEMORY_APOSTLE: EnemyDef = {
  name: "💀 記憶的使徒", icon: "🧠",
  maxHp: 5000, atk: 60, def: 35,
  defPenPct: 0, atkInterval: 0.95, drops: [],
};

function trialWaves(mob: EnemyDef, mid: EnemyDef, boss: EnemyDef): EnemyDef[][] {
  const waves: EnemyDef[][] = [];
  for (let i = 0; i < 10; i += 1) {
    if (i === 4) waves.push([{ ...mid }]);
    else if (i === 9) waves.push([{ ...boss }]);
    else waves.push([{ ...mob }]);
  }
  return waves;
}

export const TRIALS: StageDef[] = [
  {
    id: "trial-evolve",
    name: "進化的試煉",
    desc: "十波改造獸 · 敵人隨時間進化 · 掉落突變原、解鎖裝備變異",
    trial: true,
    intro: "【進化的試煉】\n· 十波改造獸，數值比照最終區。\n· 第 5 波：黃金王，每秒回血、會拖延時間。\n· 第 10 波：進化的使徒，每 5 秒輪流提升 20% 攻擊／防禦／攻速（持續累加），拖太久會打不贏。\n· 黃金王掉 1、進化的使徒掉 2 突變原；通關解鎖進化符文。\n· 每擊敗一次進化的使徒，提升裝備變異次數上限。",
    waves: trialWaves(TRIAL_MOB, TRIAL_GOLD_KING, TRIAL_APOSTLE),
  },
  // 記憶試煉：複製自進化的試煉、取消進化 buff，文案依 lore 改寫。研究無效＋研究獎勵等機制暫沿用，待設計專屬數值與機制（高攻速無名、龜向設計、追憶實際效果）。
  {
    id: "trial-memory",
    name: "記憶試煉",
    desc: "十波 · 忘卻（研究加成無效）· 純數值對拚、鼓勵防守 · 通關得 1 層追憶",
    trial: true,
    researchMult: 0,
    clearReward: "reincResearch",
    intro: "【記憶試煉】\n· 關卡效果「忘卻」：此關研究加成全數歸零。\n· 復甦戰士成群來襲，數值比照最終區。\n· 中段：無名，攻勢凌厲。\n· 尾王：記憶的使徒——無特殊技能，純數值對拚，鼓勵穩紮穩打。\n· 通關獲得一層「追憶」：永久降低研究門檻、強化研究效果。",
    waves: trialWaves(MEMORY_MOB, MEMORY_NAMELESS, MEMORY_APOSTLE),
  },
];

/** 跨章節與試煉查關卡。 */
export function findStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id) ?? TRIALS.find((s) => s.id === id);
}
