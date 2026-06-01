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
  atk: 7,
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
  hide: { id: "hide", name: "獸皮", kind: "raw", icon: "🟫" },
  shard: { id: "shard", name: "晶石", kind: "raw", icon: "🔹" },
  ingot: { id: "ingot", name: "金屬錠", kind: "intermediate", icon: "🟧" },
  leather: { id: "leather", name: "皮革", kind: "intermediate", icon: "🟤" },
  crystal: { id: "crystal", name: "精晶", kind: "intermediate", icon: "💠" },
};

// ---- 裝備：3 槽各一固定基底，詞綴池見 affixTable.csv（成本／基底待平衡） ----

export const RECIPES: Record<string, RecipeDef> = {
  weapon: {
    id: "weapon",
    name: "劍",
    icon: "🗡️",
    slot: "weapon",
    cost: { ingot: 3 },
    base: { atk: 10 },
    affixPool: affixPool("weapon"),
  },
  armor: {
    id: "armor",
    name: "甲",
    icon: "🛡️",
    slot: "armor",
    cost: { leather: 4 },
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

export type RecipeKind = "refine" | "equipment" | "core" | "assembler" | "lab";

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
export const ASSEMBLER_COST: Record<string, number> = { ore: 8, hide: 8, shard: 8 };
export const LAB_COST: Record<string, number> = { ingot: 8, leather: 8, crystal: 8 };

export const PROD_RECIPES: Record<RecipeId, ProdRecipeDef> = {
  smelt: { id: "smelt", name: "熔煉", icon: "🔥", kind: "refine", input: { ore: 2 }, output: { ingot: 1 }, cycleTime: 6, unlock: "start" },
  tan: { id: "tan", name: "鞣製", icon: "🧵", kind: "refine", input: { hide: 2 }, output: { leather: 1 }, cycleTime: 6, unlock: "start" },
  crystallize: { id: "crystallize", name: "晶化", icon: "⚗️", kind: "refine", input: { shard: 2 }, output: { crystal: 1 }, cycleTime: 6, unlock: "zone1" },
  weapon: { id: "weapon", name: "武器", icon: RECIPES.weapon.icon, kind: "equipment", slot: "weapon", input: RECIPES.weapon.cost, cycleTime: 4, unlock: "start" },
  armor: { id: "armor", name: "防具", icon: RECIPES.armor.icon, kind: "equipment", slot: "armor", input: RECIPES.armor.cost, cycleTime: 4, unlock: "start" },
  accessory: { id: "accessory", name: "飾品", icon: RECIPES.accessory.icon, kind: "equipment", slot: "accessory", input: RECIPES.accessory.cost, cycleTime: 4, unlock: "zone1" },
  core: { id: "core", name: "核心", icon: CORE_RECIPE.icon, kind: "core", input: CORE_RECIPE.cost, cycleTime: 8, unlock: "core" },
  assembler: { id: "assembler", name: "組裝機", icon: "🛠️", kind: "assembler", input: ASSEMBLER_COST, cycleTime: 3, unlock: "start" },
  lab: { id: "lab", name: "研究室", icon: "🔬", kind: "lab", input: LAB_COST, cycleTime: 3, unlock: "start" },
};

// ---- 關卡：20 關，5 區 × 4 關（第 4 關為魔王） ----

const RAWS = ["ore", "hide", "shard"]; // 三種素材所有關卡都掉
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
  [18, 29, 44, 62],
  [109, 137, 164, 200],
  [312, 374, 447, 530],
  [796, 936, 1100, 1287],
  [1872, 2210, 2600, 3068],
];
const E_ATK = [
  [3, 5, 7, 8],
  [17, 20, 23, 27],
  [35, 39, 46, 52],
  [70, 82, 94, 108],
  [135, 156, 182, 208],
];
const E_DEF = [
  [0, 1, 1, 2],
  [2, 3, 3, 4],
  [5, 6, 7, 8],
  [9, 11, 13, 15],
  [18, 21, 24, 28],
];
const Z_INTERVAL = [1.4, 1.3, 1.25, 1.2, 1.15];

// 魔王數值：直接指定，與一般敵人曲線解耦，方便獨立調整（逐區加碼抵銷生產雪球；待平衡）
const BOSS_HP = [234, 1456, 2080, 11232, 24600];
const BOSS_ATK = [13, 21.6, 83, 220, 180];
const BOSS_INTERVAL = [1.4, 0.65, 1.25, 1.8, 0.95];

/** 三種素材全掉，量隨關卡編號指數上升（後期數量級暴增）；魔王 ×10。待平衡。 */
function buildDrops(stageIndex: number, isBoss: boolean): DropDef[] {
  const base = Math.max(1, Math.round(1.6 ** stageIndex));
  const m = base * (isBoss ? 10 : 1);
  return RAWS.map((mat) => ({ material: mat, min: m, max: m * 2, chance: 1 }));
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
