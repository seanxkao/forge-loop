import type { GameState } from "./types.ts";
import { STAGES } from "./content.ts";

export const SAVE_VERSION = 9;

export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    inventory: {},
    // 起手免費附三種機台各一台
    machines: {
      furnace: { count: 1, active: 1, progress: 0, productivity: 0, idle: false, cores: [null, null] },
      tannery: { count: 1, active: 1, progress: 0, productivity: 0, idle: false, cores: [null, null] },
      crystallizer: { count: 1, active: 1, progress: 0, productivity: 0, idle: false, cores: [null, null] },
    },
    equipmentInv: [],
    warehouseInv: [],
    filters: { weapon: [], armor: [], accessory: [], core: [] },
    equipped: { weapon: null, armor: null, accessory: [null, null] },
    combat: {
      stageId: STAGES[0].id,
      waveIndex: 0,
      enemyIndex: 0,
      enemyHp: 0, // 由 combat 初始化
      heroHp: 0, // 由 combat 初始化
      heroAtkTimer: 0,
      enemyAtkTimer: 0,
      clearPause: 0,
      pendingStageId: null,
    },
    research: { points: {}, stages: {} },
    baseResearch: { weapon: 0, armor: 0, accessory: 0, core: 0 },
    baseResearchPoints: { weapon: 0, armor: 0, accessory: 0, core: 0 },
    dismantler: { count: 1, active: 1, progress: 0, cores: [null, null] },
    // 起手免費附三槽製裝機各一台
    crafters: {
      weapon: { count: 1, active: 1, progress: 0, productivity: 0, queue: 0, idle: false, cores: [null, null] },
      armor: { count: 1, active: 1, progress: 0, productivity: 0, queue: 0, idle: false, cores: [null, null] },
      accessory: { count: 1, active: 1, progress: 0, productivity: 0, queue: 0, idle: false, cores: [null, null] },
    },
    coreCrafter: { count: 1, active: 1, progress: 0, productivity: 0, queue: 0, idle: false, cores: [null, null] },
    reincarnation: {
      cycle: 1,
      buffs: { research: 0, materials: 0, power: 0 },
      victoryPending: false,
      gameCleared: false,
    },
    progress: {
      unlockedStageCount: 1,
      coreUnlocked: false,
      autoAdvanceNext: false,
    },
    nextEquipId: 1,
  };
}
