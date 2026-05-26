// src/core/GameState.ts
import { CLOUD_DEV_DEFAULTS } from '../world/cloud/cloudDevDefaults';
import type { CloudHorizonRingSettings } from '../world/cloud/cloudHorizonRing';
import { GRASS_DEV_DEFAULTS } from '../world/grass/grassDevDefaults';
import { PHASE0 } from '../config/phase0';

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
  disableShadows: boolean;
  disableEdgeAa: boolean;
  logGpuPeriodic: boolean;
}

export interface GrassDevSettings {
  windStrength: number;
  windSpeed: number;
  densityMul: number;
  scaleMul: number;
  dirty: boolean;
}

export interface TerrainDevSettings {
  textureRepeat: number;
  displacementScale: number;
  displacementEnabled: boolean;
  normalStrength: number;
  aoStrength: number;
  specularStrength: number;
  slopeRockStart: number;
  pathBlendSoft: number;
  dirty: boolean;
}

/** Horizon fog: three concentric rings (near / mid / far), like water tiers. */
export interface CloudDevSettings {
  rings: [CloudHorizonRingSettings, CloudHorizonRingSettings, CloudHorizonRingSettings];
  /** Rotate all horizon rings around Y (degrees). */
  ringRotationDeg: number;
  puffAlphaMin: number;
  rotationJitter: number;
  dirty: boolean;
}

/** Development-only tuning; UI writes here when import.meta.env.DEV */
export const devSettings = {
  movementSpeedMultiplier: 1,
  showFpsCounter: false,
  grass: {
    ...GRASS_DEV_DEFAULTS,
    dirty: false,
  } as GrassDevSettings,
  terrain: {
    textureRepeat: PHASE0.TERRAIN_TEXTURE_REPEAT as number,
    displacementScale: PHASE0.TERRAIN_DISPLACEMENT_SCALE as number,
    displacementEnabled: true,
    normalStrength: PHASE0.TERRAIN_NORMAL_STRENGTH as number,
    aoStrength: PHASE0.TERRAIN_AO_STRENGTH as number,
    specularStrength: PHASE0.TERRAIN_SPECULAR_STRENGTH as number,
    slopeRockStart: PHASE0.TERRAIN_SLOPE_ROCK_START as number,
    pathBlendSoft: 1.6,
    dirty: true,
  } as TerrainDevSettings,
  clouds: {
    ...CLOUD_DEV_DEFAULTS,
    dirty: true,
  } as CloudDevSettings,
  renderDebug: {
    hideTerrain: false,
    hideWater: false,
    hideClouds: false,
    hideScatter: false,
    hideSky: false,
    disableBloom: false,
    disableShadows: false,
    disableEdgeAa: false,
    logGpuPeriodic: false,
  } satisfies RenderDebugSettings,
};
