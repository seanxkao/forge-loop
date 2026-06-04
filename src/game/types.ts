export type Slot = "weapon" | "armor" | "accessory";
export type ItemSlot = Slot | "core";
export type BaseResearchSlot = Slot | "core";
export type EquipSlotId = "weapon" | "armor" | "accessory1" | "accessory2";
export type RuneId = "berserk_haste" | "vital_regen" | "evolve";
export type RuneStoneId = "less_drawback" | "amplify" | "dual";
export type ItemRarity = "normal" | "magic" | "rare" | "legendary";
export type ItemKind = "equipment" | "core";
export type AffixTag = "physical" | "crit" | "speed" | "life" | "defense" | "craft" | "mutation";
export type MachineTargetKind = "row" | "lab";

export interface StatBlock {
  hp: number;
  atkMin: number;
  atkMax: number;
  localPhysPct: number;
  localHastePct: number;
  def: number;
  critChance: number;
  critMult: number;
  haste: number;
  hpRegen: number;
  dmgReductionPct: number;
  blockChance: number;
  defPenPct: number;
}

export type PartialStats = Partial<StatBlock>;

export type AffixStat =
  | keyof StatBlock
  | "atk"
  | "materialDropPct"
  | "productivity"
  | "machineSpeedPct"
  | "materialRefundPct"
  | "upgradeTierChance"
  | "rarityBonus"
  | "luckyTierChance"
  | "weightPhysical"
  | "weightCrit"
  | "weightSpeed"
  | "weightLife"
  | "weightDefense"
  | "weightCraft"
  // 變異詞專屬（無法正常骰／工藝取得，只能變異長出）：
  | "mutDoubleStrike" // 武器：機率追加第二擊（10× 速度）
  | "mutMaxHpPct" // 防具：最大生命 +%
  | "mutLowHpRegen" // 防具：生命 <50% 時更多秒回 +%
  | "mutCritHeal" // 飾品：暴擊時回復最大生命 +%
  | "mutAmplify"; // 飾品：增幅同件其他詞綴效果 +%

export interface MaterialDef {
  id: string;
  name: string;
  kind: "raw" | "intermediate";
  icon: string;
}

export interface DropDef {
  material: string;
  min: number;
  max: number;
  chance: number;
  /** 不受轉生素材掉落加成倍率影響（如突變原等特殊通貨）。 */
  noMultiplier?: boolean;
}

export interface EnemyDef {
  name: string;
  icon: string;
  maxHp: number;
  atk: number;
  def: number;
  defPenPct: number;
  atkInterval: number;
  drops: DropDef[];
  /** 黃金王：每秒回復最大血量的比例（如 0.02＝2%/s）。 */
  healPctPerSec?: number;
  /** 進化的使徒：每 5 秒輪流 +5% 原始攻擊／防禦／攻速（累加）。 */
  evolve?: boolean;
  /** 力量的使徒：開場與每 5 秒刷新成滿盾的盾量（如 32000）；盾未破時攻擊、破盾後停手到刷新。 */
  shield?: number;
  /** 失血狂暴：每失去 enrageHpStep 生命，攻速 +enrageSpeedPct（類狂戰）。需兩欄都設。 */
  enrageHpStep?: number;
  enrageSpeedPct?: number;
  /** 擊敗此敵人時解鎖的符文（加入 runes.owned）。 */
  unlocksRune?: RuneId;
}

export interface StageDef {
  id: string;
  name: string;
  desc: string;
  waves: EnemyDef[][];
  /** 試煉關：放在地圖「試煉」分頁、不在章節線性進度內。 */
  trial?: boolean;
  /** 此關研究加成倍率（deriveStats 套用；1＝全額、0.5＝減半、0＝無效）。 */
  researchMult?: number;
  /** 通關獎勵：reincResearch＝直接 +1 層輪迴研究加成。 */
  clearReward?: "reincResearch";
  /** 首次進入顯示的對話框文字。 */
  intro?: string;
}

export interface MachineDef {
  id: string;
  name: string;
  icon: string;
  buildCost: Record<string, number>;
  input: Record<string, number>;
  output: Record<string, number>;
  cycleTime: number;
}

export interface AffixTier {
  tier: number;
  weight: number;
  min: number;
  max: number;
}

export interface AffixDef {
  stat: AffixStat;
  label: string;
  pct?: boolean;
  tags?: AffixTag[];
  fixed?: boolean;
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

export interface CoreRecipeDef {
  id: "core";
  name: string;
  icon: string;
  cost: Record<string, number>;
  fixedAffix: AffixDef;
  affixPool: AffixDef[];
}

export type FilterStat = AffixStat | "__any__";

/** 比較方向：至少（≥）或至多（≤）。 */
export type FilterCmp = "gte" | "lte";

export type FilterEntry =
  | {
      kind: "affixTier";
      stat: FilterStat;
      cmp: FilterCmp;
      tier: number;
    }
  | {
      kind: "variableAffixes";
      cmp: FilterCmp;
      count: number;
    }
  | {
      kind: "rarity";
      cmp: FilterCmp;
      rarity: ItemRarity;
    };

export interface Affix {
  stat: AffixStat;
  value: number;
  valueMax?: number;
  label: string;
  pct?: boolean;
  tier: number;
  tags?: AffixTag[];
  fixed?: boolean;
  /** 以「附加」工藝打上去的詞綴：全裝僅一條，再附加會先移除舊的；UI 以不同顏色顯示。 */
  augmented?: boolean;
  /** 變異詞（帶 mutation tag）：無法正常骰／工藝取得，每件最多 1 條，只有 2 階。 */
  mutation?: boolean;
  /** 由變異「空格升階」長出的一般詞（移除變異時整條刪除，視為原本不存在）。 */
  mutCreated?: boolean;
  /** 變異前的階／值快照（首次被變異升降階時記錄，供「移除變異」還原；變異詞／mutCreated 不需此欄）。 */
  preMut?: { tier: number; value: number; valueMax?: number };
}

interface ItemBase {
  uid: number;
  recipeId: string;
  name: string;
  icon: string;
  rarity: ItemRarity;
  locked: boolean;
  affixes: Affix[];
}

export interface Equipment extends ItemBase {
  kind: "equipment";
  slot: Slot;
  base: PartialStats;
  /** 已用變異次數（剩餘＝全域上限 − 此值）。 */
  mutationsUsed?: number;
}

export interface CoreItem extends ItemBase {
  kind: "core";
  slot: "core";
}

export type Item = Equipment | CoreItem;

/** 生產配方 id：提煉 3 種、裝備 3 種、核心、以及機台自身（組裝機／研究室）。 */
export type RecipeId =
  | "smelt"
  | "crystallize"
  | "create_biosteel"
  | "create_heal"
  | "create_damage"
  | "stable_ingot"
  | "stable_crystal"
  | "stable_mutagen"
  | "weapon"
  | "armor"
  | "accessory"
  | "core"
  | "assembler"
  | "lab"
  | "dismantler";

/** 生產行：一條生產線。recipe 為 null 表示空行。cores 掛在整行、效果套用該線。
 *  filter 為每行獨立（僅會 roll 物品的配方有意義，決定產物進背包或倉庫）。 */
export interface ProductionRow {
  recipe: RecipeId | null;
  count: number;
  paused: boolean; // 暫停的行不耗料、不產出
  auto: boolean; // true＝連續自動生產；false＝只做訂單佇列
  queue: number; // 手動模式下的待製訂單數
  machineStep: number; // 此行增減機台的步進量（十的冪次、最低 1）
  orderStep: number; // 此行下單的步進量（十的冪次、最低 1）

  progress: number;
  productivity: number;
  idle: boolean;
  /** 已預留的原料緩衝（公平發料用）；最多存 台數 × 一次運轉量。UI 不顯示。 */
  reserved: Record<string, number>;
  cores: [CoreItem | null, CoreItem | null];
  filter: FilterEntry[];
}

export interface ProductionTab {
  name: string;
  rows: ProductionRow[];
}

export interface ProductionState {
  tabs: ProductionTab[];
}

/** 研究室（已停用、保留供存檔相容；不再運轉、不顯示）。 */
export interface LabState {
  count: number;
  active: boolean;
  progress: number;
  cores: [CoreItem | null, CoreItem | null];
}

/** 拆解機：以台數計，自動從倉庫拆裝備產出精髓／結晶。核心產能＝額外免費拆解。 */
export interface DismantlerState {
  count: number;
  progress: number;
  productivity: number; // 產能累積器，達 1 觸發一次免費拆解（不消耗裝備）
  cores: [CoreItem | null, CoreItem | null];
}

export interface CombatState {
  stageId: string;
  waveIndex: number;
  enemyIndex: number;
  enemyHp: number;
  heroHp: number;
  heroAtkTimer: number;
  enemyAtkTimer: number;
  clearPause: number;
  pendingStageId: string | null;
  /** 當前關卡研究加成倍率（startStage 設定；1＝全額、0.5＝減半）。 */
  researchMult: number;
  /** 進化的使徒技能計時與累加層數（每 5 秒輪流 +X% 原始 atk/def/攻速）。 */
  evolveTimer: number;
  evolveAtk: number;
  evolveDef: number;
  evolveSpd: number;
  evolveNext: number;
  /** 進化符文：英雄自身的進化計時與累加層數（死亡／換關時歸零，跨波保留）。 */
  heroEvolveTimer: number;
  heroEvolveAtk: number;
  heroEvolveDef: number;
  heroEvolveSpd: number;
  heroEvolveNext: number;
  createModeTimer: number;
  createMode: 0 | 1 | 2;
  createModeAnnounced: boolean;
  /** 力量的使徒護盾：當前盾量、刷新計時、是否已被打破（破盾期間尾王停手）。 */
  shieldHp: number;
  shieldTimer: number;
  shieldBroken: boolean;
}

export type ReincarnationBuff = "research" | "materials" | "power";

export interface ReincarnationState {
  cycle: number;
  buffs: Record<ReincarnationBuff, number>;
  victoryPending: boolean;
  gameCleared: boolean;
}

export interface RuneState {
  owned: RuneId[];
  /** 當前配置的符文（0~2 個；雙生符石啟用才可 2 個）。 */
  selected: RuneId[];
  /** 每個符文的等級（預設 1，最高 20；每級 +10% 效果）。 */
  levels: Record<string, number>;
  /** 已用符文碎片解鎖的符石。 */
  unlockedStones: RuneStoneId[];
  /** 當前生效的符石（一次只一個）。 */
  selectedStone: RuneStoneId | null;
}

/** 戰鬥中更改裝備／符文的待辦動作：下場戰鬥開始時才依序套用。 */
export type LoadoutAction =
  | { kind: "equip"; uid: number; slot?: EquipSlotId } // slot＝排入當下決定的目標槽，固定不重算
  | { kind: "unequip"; slot: EquipSlotId }
  | { kind: "rune"; ids: RuneId[] };

export interface ProgressState {
  unlockedStageCount: number;
  coreUnlocked: boolean;
  autoAdvanceNext: boolean;
  placedFirstMachine: boolean;
  recipeGuideSeen: boolean;
  craftedEquipmentOnce: boolean;
  bagGuideSeen: boolean;
  equippedGuideSeen: boolean;
  grantedLegendaryCore24: boolean;
  grantedLegendaryCore44: boolean;
  trialIntroSeen: boolean;
  /** 已從試煉獲得的研究加成層數（上限 5）。 */
  trialResearchLayers: number;
  /** 擊敗進化的使徒的累積次數：解鎖變異、決定每件變異次數上限 min(8, 2+此值)。 */
  apostleWins: number;
  createTrialCleared: boolean;
  /** 首次挑戰力量試煉（不論成敗）即解鎖右側「符文」分頁。 */
  runeTabUnlocked: boolean;
}

export interface GameState {
  version: number;
  inventory: Record<string, number>;
  production: ProductionState;
  spareAssemblers: number;
  lab: LabState;
  dismantler: DismantlerState;
  /** 拆解產出的通貨：詞綴精髓（每 stat 一種）與基底結晶（每槽一種）。研究瞬間消耗之。 */
  essences: Record<string, number>;
  crystals: Record<BaseResearchSlot, number>;
  /** 背包整理過濾器（每類型一組）：「整理背包」會把現有主背包不符的收進倉庫。 */
  bagFilters: Record<ItemSlot, FilterEntry[]>;
  equipmentInv: Item[];
  warehouseInv: Item[];
  equipped: {
    weapon: Equipment | null;
    armor: Equipment | null;
    accessory: [Equipment | null, Equipment | null];
  };
  combat: CombatState;
  research: { points: Record<string, number>; stages: Record<string, number> };
  baseResearch: Record<BaseResearchSlot, number>;
  baseResearchPoints: Record<BaseResearchSlot, number>;
  runes: RuneState;
  /** 戰鬥中暫存的換裝／符文更改，下場戰鬥開始時套用。 */
  pendingLoadout: LoadoutAction[];
  reincarnation: ReincarnationState;
  progress: ProgressState;
  nextEquipId: number;
}
