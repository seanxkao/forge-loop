import type { GameState } from "./types.ts";
import { STAGES } from "./content.ts";
import { INITIAL_RUNES } from "./runes.ts";

export const SAVE_VERSION = 15;

export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    inventory: {
      ingot: 200,
      crystal: 100,
      mutagen: 0, // 需列在預設 schema，否則 migrate 會在重整時丟棄（突變原是囤積型通貨，不可遺失）
    },
    // 生產：開局 1 個子分頁、無放置；送 1 台庫存組裝機由玩家放置（首格閃爍引導）。
    production: { tabs: [{ name: "生產線", rows: [] }] },
    spareAssemblers: 10,
    // 研究室已停用、保留 0 台供存檔相容。
    lab: { count: 0, active: true, progress: 0, cores: [null, null] },
    // 拆解機開局 0 台，需自行用組裝機生產。
    dismantler: { count: 0, progress: 0, productivity: 0, cores: [null, null] },
    essences: {},
    crystals: { weapon: 0, armor: 0, accessory: 0, core: 0 },
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
      researchMult: 1,
      evolveTimer: 0,
      evolveAtk: 0,
      evolveDef: 0,
      evolveSpd: 0,
      evolveNext: 0,
      heroEvolveTimer: 0,
      heroEvolveAtk: 0,
      heroEvolveDef: 0,
      heroEvolveSpd: 0,
      heroEvolveNext: 0,
    },
    research: { points: {}, stages: {} },
    baseResearch: { weapon: 0, armor: 0, accessory: 0, core: 0 },
    baseResearchPoints: { weapon: 0, armor: 0, accessory: 0, core: 0 },
    runes: {
      owned: [...INITIAL_RUNES],
      selected: null,
    },
    pendingLoadout: [],
    reincarnation: {
      cycle: 1,
      buffs: { research: 0, materials: 0, power: 0 },
      victoryPending: false,
      gameCleared: false,
    },
    progress: {
      unlockedStageCount: 1,
      coreUnlocked: false,
      autoAdvanceNext: true,
      placedFirstMachine: false,
      recipeGuideSeen: false,
      craftedEquipmentOnce: false,
      bagGuideSeen: false,
      equippedGuideSeen: false,
      grantedLegendaryCore24: false,
      grantedLegendaryCore44: false,
      trialIntroSeen: false,
      trialResearchLayers: 0,
      apostleWins: 0,
    },
    nextEquipId: 1,
  };
}
