// 共用型別定義

export type Slot = "weapon" | "armor" | "accessory";

/** 可加總的戰鬥屬性。haste：攻速加成，atkInterval = baseInterval / (1 + haste)。 */
export interface StatBlock {
  hp: number;
  atk: number; // 全域點傷加總（武器點傷於屬性推導時以本地計算後併入）
  localPhysPct: number; // 武器本地物理%（只乘武器；推導時消化，最終值通常為 0）
  def: number;
  critChance: number; // 0..1，加總
  critMult: number; // 暴擊倍率加成（基底 1.5）
  haste: number; // 攻速加成
  hpRegen: number; // 每秒回血
  dmgReductionPct: number; // 百分比減傷，0..0.9（上限見 hero.ts）
  critDmgTakenReductionPct: number; // 減少承受暴擊傷害，0..1
}

export type PartialStats = Partial<StatBlock>;

// ---- 靜態內容定義 ----

export interface MaterialDef {
  id: string;
  name: string;
  kind: "raw" | "intermediate";
  icon: string; // emoji 佔位圖示
}

export interface DropDef {
  material: string;
  min: number;
  max: number;
  chance: number; // 0..1
}

export interface EnemyDef {
  name: string;
  icon: string;
  maxHp: number;
  atk: number;
  def: number;
  atkInterval: number; // 秒
  drops: DropDef[];
  critChance?: number; // 一般敵人 0/未填；魔王 >0
  critMult?: number; // 敵人暴擊倍率（魔王用）
}

export interface StageDef {
  id: string;
  name: string;
  desc: string;
  waves: EnemyDef[][]; // 每波是一組敵人，逐隻擊破
}

export interface MachineDef {
  id: string;
  name: string;
  icon: string;
  buildCost: Record<string, number>;
  input: Record<string, number>;
  output: Record<string, number>;
  cycleTime: number; // 每生產週期秒數
}

/** 一條詞綴的單一品質階：自己的數值範圍與抽中權重（越高階越強、越難中）。 */
export interface AffixTier {
  tier: number; // 1..N
  weight: number; // 抽中此階的權重
  min: number;
  max: number;
}

/** 詞綴定義：一個屬性 ＋ 多個品質階（由 affixTable.csv 解析）。 */
export interface AffixDef {
  stat: keyof StatBlock;
  label: string; // 顯示名，如 "點傷"
  pct?: boolean; // 顯示時是否乘 100 加 %
  tiers: AffixTier[];
}

export interface RecipeDef {
  id: string;
  name: string;
  icon: string;
  slot: Slot;
  cost: Record<string, number>;
  base: PartialStats;
  affixPool: AffixDef[];
}

/** 過濾器一列條件：要求某屬性存在且品質階 ≥ minTier。 */
export interface FilterEntry {
  stat: keyof StatBlock;
  minTier: number;
}

// ---- 動態實例 ----

export interface Affix {
  stat: keyof StatBlock;
  value: number;
  label: string;
  pct?: boolean;
  tier: number; // 抽中的品質階
}

export interface Equipment {
  uid: number;
  recipeId: string;
  name: string;
  icon: string;
  slot: Slot;
  base: PartialStats;
  affixes: Affix[];
}

export interface MachineState {
  count: number; // 總台數（製造增加，不會減少）
  active: number; // 運轉中台數（0..count，+/- 配置；閒置者不耗料不產出）
  progress: number; // 0..cycleTime 累積秒數
  idle: boolean; // 缺料閒置（含部分缺料）
}

/** 製裝機（每槽一台型別）：總台數、運轉台數、週期進度（秒）、待製佇列件數、缺料暫停旗標。
 *  製裝速度 = 基礎 × 運轉台數；逐件消耗該槽配方材料製裝，佇列空則閒置。 */
export interface CrafterState {
  count: number; // 總台數（製造增加，不會減少）
  active: number; // 運轉中台數（0..count）
  progress: number; // 0..cycleTime 累積秒數
  queue: number; // 待製件數
  idle: boolean; // 缺料暫停（非佇列空閒置）
}

export interface CombatState {
  stageId: string;
  waveIndex: number;
  enemyIndex: number;
  enemyHp: number; // 當前敵人剩餘血
  heroHp: number;
  heroAtkTimer: number;
  enemyAtkTimer: number;
}

export interface GameState {
  version: number;
  inventory: Record<string, number>; // 素材庫存
  machines: Record<string, MachineState>; // 各類機台的運轉台數與進度（取代盤面）
  equipmentInv: Equipment[]; // 主背包：已製作、未裝備
  warehouseInv: Equipment[]; // 倉庫背包：存放的裝備（過濾器可自動塞入）
  filters: Record<Slot, FilterEntry[]>; // 各槽的必備詞綴過濾條件
  equipped: Record<Slot, Equipment | null>;
  combat: CombatState;
  /** 研究進度：points＝各類詞綴當前階累積研究值；stages＝各類已完成階數。 */
  research: { points: Record<string, number>; stages: Record<string, number> };
  /** 基底研究：各槽已完成階數（消耗該基底道具，永久提升該槽基底數值）。 */
  baseResearch: Record<Slot, number>;
  baseResearchPoints: Record<Slot, number>;
  /** 拆解器：總台數、運轉台數、週期進度（秒）。拆解速度 = 基礎 × 運轉台數。 */
  dismantler: { count: number; active: number; progress: number };
  /** 製裝機：每槽一台型別，總台數／運轉台數／週期進度／待製佇列。速度 = 基礎 × 運轉台數。 */
  crafters: Record<Slot, CrafterState>;
  nextEquipId: number;
}
