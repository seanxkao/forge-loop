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

export const HERO_BASE_INTERVAL = 1.2;
export const GRID_WIDTH = 3;
export const GRID_HEIGHT = 3;

export const MATERIALS: Record<string, MaterialDef> = {
  ore: { id: "ore", name: "鐵礦", kind: "raw", icon: "⛏" },
  shard: { id: "shard", name: "碎晶", kind: "raw", icon: "🔹" },
  ingot: { id: "ingot", name: "鐵錠", kind: "intermediate", icon: "🧱" },
  crystal: { id: "crystal", name: "結晶", kind: "intermediate", icon: "💎" },
  mutagen: { id: "mutagen", name: "突變原", kind: "intermediate", icon: "🧫" },
  living_gold: { id: "living_gold", name: "生金", kind: "intermediate", icon: "🪙" },
  biosteel: { id: "biosteel", name: "生物鋼", kind: "intermediate", icon: "🧬" },
  stable_biosteel: { id: "stable_biosteel", name: "穩定生物鋼", kind: "intermediate", icon: "⚙️" },
};

export const RECIPES: Record<string, RecipeDef> = {
  weapon: {
    id: "weapon",
    name: "武器",
    icon: "🗡",
    slot: "weapon",
    cost: { ingot: 3 },
    base: { atkMin: 18, atkMax: 22 },
    affixPool: affixPool("weapon"),
  },
  armor: {
    id: "armor",
    name: "防具",
    icon: "🛡",
    slot: "armor",
    cost: { ingot: 4 },
    base: { hp: 80, def: 3 },
    affixPool: affixPool("armor"),
  },
  accessory: {
    id: "accessory",
    name: "飾品",
    icon: "💍",
    slot: "accessory",
    cost: { crystal: 2 },
    base: { critChance: 0.05 },
    affixPool: [...affixPool("accessory"), MATERIAL_DROP_AFFIX],
  },
};

export { CORE_RECIPE };

export type RecipeKind =
  | "refine"
  | "equipment"
  | "core"
  | "assembler"
  | "lab"
  | "dismantler"
  | "trialHeal"
  | "trialDamage"
  | "trialCatalyst";

export interface ProdRecipeDef {
  id: RecipeId;
  name: string;
  icon: string;
  kind: RecipeKind;
  input: Record<string, number>;
  output?: Record<string, number>;
  cycleTime: number;
  slot?: Slot;
  unlock: "start" | "zone1" | "core" | "createTrial";
}

export const ASSEMBLER_COST: Record<string, number> = { ore: 16, shard: 8 };
export const LAB_COST: Record<string, number> = { ingot: 16, crystal: 8 };

export const PROD_RECIPES: Record<RecipeId, ProdRecipeDef> = {
  smelt: { id: "smelt", name: "煉鐵", icon: "🔥", kind: "refine", input: { ore: 2 }, output: { ingot: 1 }, cycleTime: 6, unlock: "start" },
  crystallize: { id: "crystallize", name: "結晶化", icon: "✨", kind: "refine", input: { shard: 2 }, output: { crystal: 1 }, cycleTime: 6, unlock: "zone1" },
  create_biosteel: { id: "create_biosteel", name: "生物鋼", icon: "🧬", kind: "refine", input: { living_gold: 1 }, output: { biosteel: 1 }, cycleTime: 2.5, unlock: "createTrial" },
  create_heal: { id: "create_heal", name: "生鋼補血", icon: "💚", kind: "trialHeal", input: { biosteel: 1 }, cycleTime: 1, unlock: "createTrial" },
  create_damage: { id: "create_damage", name: "生鋼增傷", icon: "🔥", kind: "trialDamage", input: { biosteel: 1 }, cycleTime: 1, unlock: "createTrial" },
  stable_ingot: { id: "stable_ingot", name: "穩鋼煉鐵", icon: "⚙️", kind: "refine", input: { ingot: 100000, stable_biosteel: 10 }, output: { ingot: 1000000 }, cycleTime: 6, unlock: "createTrial" },
  stable_crystal: { id: "stable_crystal", name: "穩鋼結晶", icon: "⚙️", kind: "refine", input: { crystal: 100000, stable_biosteel: 10 }, output: { crystal: 1000000 }, cycleTime: 6, unlock: "createTrial" },
  stable_mutagen: { id: "stable_mutagen", name: "穩鋼催化", icon: "⚙️", kind: "trialCatalyst", input: { mutagen: 100, stable_biosteel: 1 }, output: { mutagen: 101 }, cycleTime: 6, unlock: "createTrial" },
  weapon: { id: "weapon", name: "武器", icon: RECIPES.weapon.icon, kind: "equipment", slot: "weapon", input: RECIPES.weapon.cost, cycleTime: 4, unlock: "start" },
  armor: { id: "armor", name: "防具", icon: RECIPES.armor.icon, kind: "equipment", slot: "armor", input: RECIPES.armor.cost, cycleTime: 4, unlock: "start" },
  accessory: { id: "accessory", name: "飾品", icon: RECIPES.accessory.icon, kind: "equipment", slot: "accessory", input: RECIPES.accessory.cost, cycleTime: 4, unlock: "zone1" },
  core: { id: "core", name: "核心", icon: CORE_RECIPE.icon, kind: "core", input: CORE_RECIPE.cost, cycleTime: 8, unlock: "core" },
  assembler: { id: "assembler", name: "組裝機", icon: "🏭", kind: "assembler", input: ASSEMBLER_COST, cycleTime: 3, unlock: "start" },
  lab: { id: "lab", name: "研究室", icon: "🧪", kind: "lab", input: LAB_COST, cycleTime: 3, unlock: "start" },
  dismantler: { id: "dismantler", name: "拆解機", icon: "🪓", kind: "dismantler", input: LAB_COST, cycleTime: 3, unlock: "start" },
};

const RAWS = ["ore", "shard"] as const;
const ZONE = [
  { area: "荒野", enemy: "狼", icon: "🐺", boss: "荒野王" },
  { area: "洞窟", enemy: "石獸", icon: "🪨", boss: "狼王" },
  { area: "晶林", enemy: "晶獸", icon: "🦎", boss: "晶核王" },
  { area: "金域", enemy: "黃金獸", icon: "👑", boss: "黃金王" },
  { area: "終境", enemy: "改造獸", icon: "🧬", boss: "使徒" },
] as const;
const STAGE_NAMES = [
  "荒野外圍", "破裂巢穴", "灰岩坡地", "荒野王座",
  "洞窟入口", "碎柱長廊", "回音深坑", "狼王巢心",
  "晶林外層", "折光坡", "共鳴樹海", "晶核庭院",
  "金域前線", "鎏金階道", "王座走廊", "黃金王庭",
  "終境邊界", "焚燼道路", "改造熔場", "使徒前庭",
] as const;

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
const BOSS_HP = [468, 2912, 4160, 22464, 49200];
const BOSS_ATK = [13, 21.6, 83, 220, 180];
const BOSS_INTERVAL = [1.4, 0.65, 1.25, 1.8, 0.95];

function buildDrops(stageIndex: number, isBoss: boolean): DropDef[] {
  const base = Math.max(1, Math.round(1.6 ** stageIndex));
  const m = base * (isBoss ? 10 : 1);
  return RAWS.map((mat) => {
    const qty = mat === "ore" ? m * 2 : m;
    return { material: mat, min: qty, max: qty * 2, chance: 1 };
  });
}

function makeWaves(waveCount: number, enemy: EnemyDef, enemiesPerWave: number): EnemyDef[][] {
  const waves: EnemyDef[][] = [];
  for (let w = 0; w < waveCount; w += 1) {
    const wave: EnemyDef[] = [];
    for (let e = 0; e < enemiesPerWave; e += 1) wave.push({ ...enemy });
    waves.push(wave);
  }
  return waves;
}

function buildStages(): StageDef[] {
  const stages: StageDef[] = [];
  for (let i = 0; i < 20; i += 1) {
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
        name: `王 ${ZONE[z].boss}`,
        icon: ZONE[z].icon,
        maxHp: BOSS_HP[z],
        atk: BOSS_ATK[z],
        def: E_DEF[z][3],
        defPenPct: z === 1 ? 0.5 : 0,
        atkInterval: BOSS_INTERVAL[z],
        drops: buildDrops(i, true),
      };
      waves = makeWaves(4, normal, 1);
      waves.push([boss]);
    } else {
      waves = makeWaves(5, normal, 1);
    }

    stages.push({
      id: `s${i + 1}`,
      name: `${i + 1}. ${STAGE_NAMES[i]}`,
      desc: `${ZONE[z].area} 第 ${i + 1} 關${isBoss ? "（王）" : ""}`,
      waves,
    });
  }
  return stages;
}

export const STAGES: StageDef[] = buildStages();

const TRIAL_MOB: EnemyDef = {
  name: "改造獸", icon: "🧬",
  maxHp: 18000, atk: 460, def: 117,
  defPenPct: 0, atkInterval: 1.15, drops: [],
};
const TRIAL_GOLD_KING: EnemyDef = {
  name: "黃金王", icon: "👑",
  maxHp: 36000, atk: 460, def: 117,
  defPenPct: 0, atkInterval: 1.0,
  drops: [{ material: "mutagen", min: 1, max: 1, chance: 1, noMultiplier: true }],
  healPctPerSec: 0.03,
};
const TRIAL_APOSTLE: EnemyDef = {
  name: "進化的使徒", icon: "🧬",
  maxHp: 145000, atk: 390, def: 120,
  defPenPct: 0, atkInterval: 0.95,
  drops: [{ material: "mutagen", min: 2, max: 2, chance: 1, noMultiplier: true }],
  evolve: true,
};

const MEMORY_MOB: EnemyDef = {
  name: "復甦戰士", icon: "🪖",
  maxHp: 600, atk: 50, def: 25,
  defPenPct: 0, atkInterval: 1.15, drops: [],
};
const MEMORY_NAMELESS: EnemyDef = {
  name: "無名", icon: "🗿",
  maxHp: 1800, atk: 60, def: 25,
  defPenPct: 0, atkInterval: 1.0, drops: [],
};
const MEMORY_APOSTLE: EnemyDef = {
  name: "記憶的使徒", icon: "📜",
  maxHp: 5000, atk: 60, def: 35,
  defPenPct: 0, atkInterval: 0.95, drops: [],
};

export const CREATE_TRIAL_ID = "trial-create";
const CREATE_MOB: EnemyDef = {
  name: "自動生鎧", icon: "🪙",
  maxHp: 22000, atk: 420, def: 140,
  defPenPct: 0, atkInterval: 1.1,
  drops: [{ material: "living_gold", min: 500000, max: 500000, chance: 1 }],
};
const CREATE_FORGE: EnemyDef = {
  name: "失落之鎧", icon: "🧪",
  maxHp: 50000, atk: 520, def: 160,
  defPenPct: 0, atkInterval: 1.0,
  drops: [{ material: "living_gold", min: 4000000, max: 4000000, chance: 1 }],
};
const CREATE_HOMUNCULUS: EnemyDef = {
  name: "創造的使徒", icon: "⚙️",
  maxHp: 110000, atk: 460, def: 180,
  defPenPct: 0, atkInterval: 1.1, drops: [],
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
    desc: "短時間內打穿不斷進化的敵人，並收集突變原。",
    trial: true,
    intro: "【進化的試煉】\n· 十波改造獸，數值比照最終區。\n· 第 5 波：黃金王，每秒回血、會拖延時間。\n· 第 10 波：進化的使徒，每 5 秒輪流提升 20% 攻擊／防禦／攻速（持續累加），拖太久會打不贏。\n· 黃金王掉 1、進化的使徒掉 2 突變原；通關解鎖進化符文。\n· 每擊敗一次進化的使徒，提升裝備變異次數上限。",
    waves: trialWaves(TRIAL_MOB, TRIAL_GOLD_KING, TRIAL_APOSTLE),
  },
  {
    id: CREATE_TRIAL_ID,
    name: "創造試煉",
    desc: "戰內掉生金，靠巨大組裝機群即時轉成生物鋼，撐過尾王三模式後把殘餘資源帶出。",
    trial: true,
    intro: "【創造試煉】\n· 小怪掉 500000 生金，中頭目掉 4000000，受素材掉落加成影響。\n· 1 生金可煉成 1 生物鋼；請用極大量組裝機即時消化。\n· 生鋼補血：每秒每台消耗 1 生物鋼；每 1000 台運轉中機器每秒回復 1% 最大生命。\n· 生鋼增傷：每秒每台消耗 1 生物鋼；每 1000 台運轉中機器提供 1% 更多傷害，且只在運轉期間生效。\n· 尾王依序進入：防禦 5 秒無敵、攻擊 10 秒攻速 2 倍且有 99% 減傷、再生 10 秒高速回血。\n· 通關後，剩餘生物鋼的 10% 會轉成可帶出的穩定生物鋼；失敗或離場則清空。",
    waves: trialWaves(CREATE_MOB, CREATE_FORGE, CREATE_HOMUNCULUS),
  },
  {
    id: "trial-memory",
    name: "記憶試煉",
    desc: "研究失效的長線對拚，通關可降低研究門檻。",
    trial: true,
    researchMult: 0,
    clearReward: "reincResearch",
    intro: "【記憶試煉】\n· 關卡效果「忘卻」：此關研究加成全數歸零。\n· 復甦戰士成群來襲，數值比照最終區。\n· 中段：無名，攻勢凌厲。\n· 尾王：記憶的使徒——無特殊技能，純數值對拚，鼓勵穩紮穩打。\n· 通關獲得一層「追憶」：永久降低研究門檻、強化研究效果。",
    waves: trialWaves(MEMORY_MOB, MEMORY_NAMELESS, MEMORY_APOSTLE),
  },
];

export function findStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id) ?? TRIALS.find((s) => s.id === id);
}
