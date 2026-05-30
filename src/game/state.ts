import type { GameState } from "./types.ts";
import { STAGES } from "./content.ts";

export const SAVE_VERSION = 9;

export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    inventory: {},
    // 起手免費附三種機台各一台
    machines: {
      furnace: { count: 1, active: 1, progress: 0, idle: false },
      tannery: { count: 1, active: 1, progress: 0, idle: false },
      crystallizer: { count: 1, active: 1, progress: 0, idle: false },
    },
    equipmentInv: [],
    warehouseInv: [],
    filters: { weapon: [], armor: [], accessory: [] },
    equipped: { weapon: null, armor: null, accessory: null },
    combat: {
      stageId: STAGES[0].id,
      waveIndex: 0,
      enemyIndex: 0,
      enemyHp: 0, // 由 combat 初始化
      heroHp: 0, // 由 combat 初始化
      heroAtkTimer: 0,
      enemyAtkTimer: 0,
    },
    research: { points: {}, stages: {} },
    baseResearch: { weapon: 0, armor: 0, accessory: 0 },
    baseResearchPoints: { weapon: 0, armor: 0, accessory: 0 },
    dismantler: { count: 1, active: 1, progress: 0 },
    // 起手免費附三槽製裝機各一台
    crafters: {
      weapon: { count: 1, active: 1, progress: 0, queue: 0, idle: false },
      armor: { count: 1, active: 1, progress: 0, queue: 0, idle: false },
      accessory: { count: 1, active: 1, progress: 0, queue: 0, idle: false },
    },
    nextEquipId: 1,
  };
}
