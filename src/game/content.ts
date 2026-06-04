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
  runeShard: { id: "runeShard", name: "符文碎片", kind: "intermediate", icon: "🔮" },
  living_gold: { id: "living_gold", name: "生金", kind: "intermediate", icon: "🪙" },
  biosteel: { id: "biosteel", name: "生物鋼", kind: "intermediate", icon: "🧊" },
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
  assembler: { id: "assembler", name: "組裝機", icon: "🛠️", kind: "assembler", input: ASSEMBLER_COST, cycleTime: 3, unlock: "start" },
  lab: { id: "lab", name: "研究室", icon: "🔬", kind: "lab", input: LAB_COST, cycleTime: 3, unlock: "start" },
  dismantler: { id: "dismantler", name: "拆解機", icon: "🪓", kind: "dismantler", input: LAB_COST, cycleTime: 3, unlock: "start" },
};

const RAWS = ["ore", "shard"] as const;
const ZONE = [
  { area: "礦坑帶", enemy: "史萊姆", icon: "🟢", boss: "史萊姆王" },
  { area: "荒野帶", enemy: "野狼", icon: "🐺", boss: "狼王" },
  { area: "晶洞帶", enemy: "晶化魔像", icon: "🗿", boss: "魔像核心" },
  { area: "鐵域帶", enemy: "鋼鐵魔偶", icon: "🤖", boss: "鋼鐵霸主" },
  { area: "虛空帶", enemy: "虛空獸", icon: "👾", boss: "虛空之王" },
] as const;
const STAGE_NAMES = [
  "廢棄礦坑", "坍方坑道", "銅脈深處", "礦坑核心",
  "枯狼林", "野獸平原", "巨獸棲地", "荒野盡頭",
  "碎晶洞", "微晶迴廊", "晶簇深淵", "共鳴晶核",
  "廢鐵堡", "熔鐵工廠", "鋼鐵巢穴", "鐵王座",
  "虛空裂隙", "崩界回廊", "虛晶聖所", "虛空之心",
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
const BOSS_INTERVAL = [1.4, 1.3, 1.25, 1.8, 0.95]; // 狼王(z1)攻速減半：0.65→1.3，改靠失血狂暴提速

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
        name: `💀 ${ZONE[z].boss}`,
        icon: ZONE[z].icon,
        maxHp: BOSS_HP[z],
        atk: BOSS_ATK[z],
        def: E_DEF[z][3],
        defPenPct: z === 1 ? 0.5 : 0,
        atkInterval: BOSS_INTERVAL[z],
        drops: buildDrops(i, true),
      };
      // 狼王（z1）：失血狂暴（每失去 250 生命 +8% 攻速）＋ 擊敗解鎖狂戰符文
      if (z === 1) {
        boss.enrageHpStep = 250;
        boss.enrageSpeedPct = 0.08;
        boss.unlocksRune = "berserk_haste";
      }
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

export const POWER_TRIAL_ID = "trial-power";
// 力量試煉：正面對決。怪掉符文碎片；吞噬者無視防禦逼快殺；力量的使徒每 5 秒刷新滿盾、破盾後停手。
const POWER_MOB: EnemyDef = {
  name: "狂信徒", icon: "⚔️",
  maxHp: 40000, atk: 900, def: 0,
  defPenPct: 0, atkInterval: 0.8,
  drops: [{ material: "runeShard", min: 50, max: 75, chance: 1, noMultiplier: true }],
};
const POWER_DEVOURER: EnemyDef = {
  name: "吞噬者", icon: "👹",
  maxHp: 80000, atk: 900, def: 0,
  defPenPct: 1.0, atkInterval: 0.8,
  drops: [{ material: "runeShard", min: 200, max: 300, chance: 1, noMultiplier: true }],
};
const POWER_APOSTLE: EnemyDef = {
  name: "力量的使徒", icon: "🛡️",
  maxHp: 160000, atk: 900, def: 0,
  defPenPct: 0, atkInterval: 1.0,
  drops: [{ material: "runeShard", min: 1000, max: 1500, chance: 1, noMultiplier: true }],
  shield: 32000,
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
    desc: "快速擊敗不斷進化的敵人。",
    trial: true,
    intro: "【進化的試煉】\n· 怪物會隨時間不斷增強。\n· 初次通關獎勵：\n· 「變異系統」能隨機調整裝備詞綴。\n· 「進化符文」每五秒獲得強化\n· 反覆通關獎勵：提升最大變異次數，最多五次",
    waves: trialWaves(TRIAL_MOB, TRIAL_GOLD_KING, TRIAL_APOSTLE),
  },
  {
    id: CREATE_TRIAL_ID,
    name: "創造的試煉",
    desc: "在戰鬥中及時生產資源以應付強大敵人。",
    trial: true,
    intro: "【創造的試煉】\n· 此區域怪物將掉落關卡內限定資源「生金」。\n· 請查看組裝機中的三種新配方以了解如何在關卡中用生金強化自己。\n· 勝利時可把剩餘生物鋼的 10% 轉成「穩定生物鋼」帶出關卡，其餘清空。",
    waves: trialWaves(CREATE_MOB, CREATE_FORGE, CREATE_HOMUNCULUS),
  },
  {
    id: "trial-memory",
    name: "記憶的試煉",
    desc: "在研究無效的情況下擊敗敵人。",
    trial: true,
    researchMult: 0,
    clearReward: "reincResearch",
    intro: "【記憶的試煉】\n· 關卡效果：「忘卻」本關卡中研究加成無效。\n· 通關獎勵：「追憶」永久降低研究門檻。",
    waves: trialWaves(MEMORY_MOB, MEMORY_NAMELESS, MEMORY_APOSTLE),
  },
  {
    id: POWER_TRIAL_ID,
    name: "力量的試煉",
    desc: "正面對決，靠你累積的強化硬剛。",
    trial: true,
    intro: "【力量的試煉】\n· 正面對決，靠前面試煉的強化擊敗強敵。\n· 怪物掉落「符文碎片」。\n· 吞噬者攻擊無視防禦，務必速殺。\n· 力量的使徒每 5 秒展開護盾，打破後它會停手，直到護盾恢復。\n· 首次挑戰（不論成敗）解鎖右側「符文」分頁，可用符文碎片強化符文。",
    waves: trialWaves(POWER_MOB, POWER_DEVOURER, POWER_APOSTLE),
  },
];

export function findStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id) ?? TRIALS.find((s) => s.id === id);
}
