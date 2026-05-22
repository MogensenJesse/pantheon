// src/core/GameState.ts
import { GRASS_SCATTER_DEFAULTS } from '../world/grass/grassDevDefaults';

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

export interface GrassDevSettings {
  windStrength: number;
  windSpeed: number;
  densityMul: number;
  coverCount: number;
  accentCount: number;
  coverMinSpacing: number;
  accentMinSpacing: number;
  coverHeightMin: number;
  coverHeightMax: number;
  accentHeightMin: number;
  accentHeightMax: number;
  coverScaleMin: number;
  coverScaleMax: number;
  accentScaleMin: number;
  accentScaleMax: number;
  dirty: boolean;
}

/** Development-only tuning; UI writes here when import.meta.env.DEV */
export const devSettings = {
  movementSpeedMultiplier: 1,
  showFpsCounter: false,
  grass: {
    windStrength: 0.18,
    windSpeed: 0.6,
    ...GRASS_SCATTER_DEFAULTS,
    dirty: false,
  } as GrassDevSettings,
  terrain: {
    textureRepeat: 0.1,
    displacementScale: 0.6,
    displacementEnabled: true,
    normalStrength: 1.0,
    aoStrength: 1,
    specularStrength: 0.35,
    slopeRockStart: 0.75,
    pathBlendSoft: 1.6,
    dirty: true,
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
