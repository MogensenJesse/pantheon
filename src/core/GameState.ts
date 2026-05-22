// src/core/GameState.ts
export interface GameState {
  energy: number;
  energyCap: number;
  stonesFound: Set<number>;
  phase: number;
  memoryFragments: number[];
}

export function createGameState(): GameState {
  return {
    energy: 0,
    energyCap: 100,
    stonesFound: new Set<number>(),
    phase: 0,
    memoryFragments: [],
  };
}

export const state = createGameState();

export interface RenderDebugSettings {
  hideTerrain: boolean;
  hideWater: boolean;
  hideClouds: boolean;
  hideScatter: boolean;
  hideSky: boolean;
  disableBloom: boolean;
  disableEmissiveBloom: boolean;
  enableEmissiveBloom: boolean;
  disableShadows: boolean;
  disableEdgeAa: boolean;
  logGpuPeriodic: boolean;
}

/** Development-only tuning; UI writes here when import.meta.env.DEV */
export const devSettings = {
  movementSpeedMultiplier: 1,
  showFpsCounter: false,
  terrain: {
    textureRepeat: 0.08,
    displacementScale: 0.45,
    displacementEnabled: true,
    normalStrength: 1.0,
    aoStrength: 0.85,
    specularStrength: 0.35,
    slopeRockStart: 0.75,
    pathBlendSoft: 1.6,
    dirty: true,
  },
  grass: {
    maxBladesPerCell: 2,
    nearRingRadius: 35,
    nearRingMultiplier: 2.5,
    globalDensityScale: 1.0,
    bendStrength: 1.0,
    hueVariation: 1.0,
    patchNoiseEnabled: true,
    lastPlayerX: 0,
    lastPlayerZ: 0,
    dirty: false,
  },
  renderDebug: {
    hideTerrain: false,
    hideWater: false,
    hideClouds: false,
    hideScatter: false,
    hideSky: false,
    disableBloom: false,
    disableEmissiveBloom: false,
    enableEmissiveBloom: false,
    disableShadows: false,
    disableEdgeAa: false,
    logGpuPeriodic: false,
  } satisfies RenderDebugSettings,
};
