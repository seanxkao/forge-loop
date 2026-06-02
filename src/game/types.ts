export type Slot = "weapon" | "armor" | "accessory";
export type ItemSlot = Slot | "core";
export type BaseResearchSlot = Slot | "core";
export type EquipSlotId = "weapon" | "armor" | "accessory1" | "accessory2";
export type RuneId = "berserk_haste" | "vital_regen";
export type ItemRarity = "normal" | "magic" | "rare" | "legendary";
export type ItemKind = "equipment" | "core";
export type AffixTag = "physical" | "crit" | "speed" | "life" | "defense" | "craft";
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
  | "weightCraft";

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
}

export interface StageDef {
  id: string;
  name: string;
  desc: string;
  waves: EnemyDef[][];
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
}

export interface CoreItem extends ItemBase {
  kind: "core";
  slot: "core";
}

export type Item = Equipment | CoreItem;

/** 生產配方 id：提煉 3 種、裝備 3 種、核心、以及機台自身（組裝機／研究室）。 */
export type RecipeId =
  | "smelt"
  | "tan"
  | "crystallize"
  | "weapon"
  | "armor"
  | "accessory"
  | "core"
  | "assembler"
  | "lab";

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

/** 研究室（取代拆解機）：以台數計，只有運轉／停開關與 2 核心插槽。 */
export interface LabState {
  count: number;
  active: boolean;
  progress: number;
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
  selected: RuneId | null;
}

/** 戰鬥中更改裝備／符文的待辦動作：下場戰鬥開始時才依序套用。 */
export type LoadoutAction =
  | { kind: "equip"; uid: number; slot?: EquipSlotId } // slot＝排入當下決定的目標槽，固定不重算
  | { kind: "unequip"; slot: EquipSlotId }
  | { kind: "rune"; id: RuneId | null };

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
}

export interface GameState {
  version: number;
  inventory: Record<string, number>;
  production: ProductionState;
  spareAssemblers: number;
  lab: LabState;
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
