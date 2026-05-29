// src/core/GameState.ts
import { CLOUD_DEV_DEFAULTS } from '../world/cloud/cloudDevDefaults';
import type { CloudHorizonRingSettings } from '../world/cloud/cloudHorizonRing';
import { GRASS_DEV_DEFAULTS } from '../world/grass/grassDevDefaults';
import { WATER_DEV_DEFAULTS, type WaterDevSettings } from '../world/water/waterDevDefaults';
import { PHASE0 } from '../config/phase0';
import { WORLD } from '../world/WorldConfig';

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
    energyCap: PHASE0.ENERGY_CAP,
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
  disableAa: boolean;
  disableGodRays: boolean;
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
  rotationJitter: number;
  /** Global night opacity scaler (lower = subtler clouds at night). */
  nightAlphaMul: number;
  /** Steeper = clouds fade in later as daylight rises. */
  alphaPower: number;
  /** Daylight at which cloud color reaches full day tint. */
  colorDayThreshold: number;
  /** 0 = twilight tint, 1 = match dark sky background. */
  nightTintDarkness: number;
  /** Set true to trigger a full horizon geometry rebuild. */
  dirty: boolean;
  /** Set true to flush live atmosphere uniforms (no rebuild). */
  liveDirty: boolean;
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
    pathBlendSoft: WORLD.JOURNEY.PATH_SURFACE.BLEND_SOFT,
    dirty: false,
  } as TerrainDevSettings,
  clouds: {
    ...CLOUD_DEV_DEFAULTS,
    dirty: false,
    liveDirty: false,
  } as CloudDevSettings,
  water: { ...WATER_DEV_DEFAULTS } as WaterDevSettings,
  renderDebug: {
    hideTerrain: false,
    hideWater: false,
    hideClouds: false,
    hideScatter: false,
    hideSky: false,
    disableBloom: false,
    disableShadows: false,
    disableAa: true,
    disableGodRays: false,
    logGpuPeriodic: false,
  } satisfies RenderDebugSettings,
};
