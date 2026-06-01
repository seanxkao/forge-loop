export type Slot = "weapon" | "armor" | "accessory";
export type ItemSlot = Slot | "core";
export type BaseResearchSlot = Slot | "core";
export type EquipSlotId = "weapon" | "armor" | "accessory1" | "accessory2";
export type ItemRarity = "normal" | "magic" | "rare" | "legendary";
export type ItemKind = "equipment" | "core";
export type AffixTag = "physical" | "crit" | "speed" | "life" | "defense" | "craft";
export type MachineTargetKind = "machine" | "crafter" | "coreCrafter" | "dismantler";

export interface StatBlock {
  hp: number;
  atk: number;
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

export type FilterEntry =
  | {
      kind: "affixTier";
      stat: FilterStat;
      minTier: number;
    }
  | {
      kind: "minVariableAffixes";
      count: number;
    }
  | {
      kind: "minRarity";
      rarity: Exclude<ItemRarity, "normal" | "legendary">;
    };

export interface Affix {
  stat: AffixStat;
  value: number;
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

export interface MachineState {
  count: number;
  active: number;
  progress: number;
  productivity: number;
  idle: boolean;
  cores: [CoreItem | null, CoreItem | null];
}

export interface CrafterState {
  count: number;
  active: number;
  progress: number;
  productivity: number;
  queue: number;
  idle: boolean;
  cores: [CoreItem | null, CoreItem | null];
}

export interface DismantlerState {
  count: number;
  active: number;
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

export interface ProgressState {
  unlockedStageCount: number;
  coreUnlocked: boolean;
  autoAdvanceNext: boolean;
  grantedLegendaryCore24: boolean;
  grantedLegendaryCore34: boolean;
}

export interface GameState {
  version: number;
  inventory: Record<string, number>;
  machines: Record<string, MachineState>;
  equipmentInv: Item[];
  warehouseInv: Item[];
  filters: Record<ItemSlot, FilterEntry[]>;
  equipped: {
    weapon: Equipment | null;
    armor: Equipment | null;
    accessory: [Equipment | null, Equipment | null];
  };
  combat: CombatState;
  research: { points: Record<string, number>; stages: Record<string, number> };
  baseResearch: Record<BaseResearchSlot, number>;
  baseResearchPoints: Record<BaseResearchSlot, number>;
  dismantler: DismantlerState;
  crafters: Record<Slot, CrafterState>;
  coreCrafter: CrafterState;
  reincarnation: ReincarnationState;
  progress: ProgressState;
  nextEquipId: number;
}
