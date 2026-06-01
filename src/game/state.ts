import type { GameState } from "./types.ts";
import { STAGES } from "./content.ts";

export const SAVE_VERSION = 9;

export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    inventory: {},
    // 生產：開局 1 個子分頁、無放置；送 1 台庫存組裝機由玩家放置（首格閃爍引導）。
    production: { tabs: [{ name: "生產線", rows: [] }] },
    spareAssemblers: 1,
    // 研究室開局 0 台，需自行用組裝機生產。
    lab: { count: 0, active: true, progress: 0, cores: [null, null] },
    bagFilters: { weapon: [], armor: [], accessory: [], core: [] },
    equipmentInv: [],
    warehouseInv: [],
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
      placedFirstMachine: false,
      grantedLegendaryCore24: false,
      grantedLegendaryCore44: false,
    },
    nextEquipId: 1,
  };
}
