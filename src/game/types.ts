export type Slot = "weapon" | "armor" | "accessory";

export interface StatBlock {
  hp: number;
  atk: number;
  localPhysPct: number;
  def: number;
  critChance: number;
  critMult: number;
  haste: number;
  hpRegen: number;
  dmgReductionPct: number;
  blockChance: number;
}

export type PartialStats = Partial<StatBlock>;

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
  stat: keyof StatBlock;
  label: string;
  pct?: boolean;
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

export interface FilterEntry {
  stat: keyof StatBlock;
  minTier: number;
}

export interface Affix {
  stat: keyof StatBlock;
  value: number;
  label: string;
  pct?: boolean;
  tier: number;
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
  count: number;
  active: number;
  progress: number;
  idle: boolean;
}

export interface CrafterState {
  count: number;
  active: number;
  progress: number;
  queue: number;
  idle: boolean;
}

export interface CombatState {
  stageId: string;
  waveIndex: number;
  enemyIndex: number;
  enemyHp: number;
  heroHp: number;
  heroAtkTimer: number;
  enemyAtkTimer: number;
}

export type ReincarnationBuff = "research" | "materials" | "power";

export interface ReincarnationState {
  cycle: number;
  buffs: Record<ReincarnationBuff, number>;
  victoryPending: boolean;
  gameCleared: boolean;
}

export interface GameState {
  version: number;
  inventory: Record<string, number>;
  machines: Record<string, MachineState>;
  equipmentInv: Equipment[];
  warehouseInv: Equipment[];
  filters: Record<Slot, FilterEntry[]>;
  equipped: Record<Slot, Equipment | null>;
  combat: CombatState;
  research: { points: Record<string, number>; stages: Record<string, number> };
  baseResearch: Record<Slot, number>;
  baseResearchPoints: Record<Slot, number>;
  dismantler: { count: number; active: number; progress: number };
  crafters: Record<Slot, CrafterState>;
  reincarnation: ReincarnationState;
  nextEquipId: number;
}
