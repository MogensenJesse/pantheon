// src/core/GameState.ts

import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { CLOUD_DEV_DEFAULTS } from '../world/cloud/cloudDevDefaults';
import type { CloudHorizonRingSettings } from '../world/cloud/cloudHorizonRing';

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

export interface GrassDevSettings {
  windStrength: number;
  windSpeed: number;
  thinningR0: number;
  thinningR1: number;
  thinningPMin: number;
  bladeMinScale: number;
  bladeMaxScale: number;
  enabled: boolean;
  dirty: boolean;
}

export interface RenderDebugSettings {
  hideTerrain: boolean;
  hideWater: boolean;
  hideClouds: boolean;
  hideMapProps: boolean;
  hideGrass: boolean;
  hideSky: boolean;
  disableBloom: boolean;
  disableShadows: boolean;
  disableAa: boolean;
  disableGodRays: boolean;
  disableDof: boolean;
  logGpuPeriodic: boolean;
  logNightHdri: boolean;
}

export interface TerrainDevSettings {
  textureRepeat: number;
  displacementScale: number;
  displacementEnabled: boolean;
  normalStrength: number;
  aoStrength: number;
  specularStrength: number;
  slopeRockStart: number;
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

/** Mutable copy of VISUAL.water for live dev sliders. */
export interface WaterDevSettings {
  size: number;
  alpha: number;
  distortionDay: number;
  distortionNight: number;
}

/** Development-only tuning; UI writes here when import.meta.env.DEV */
export const devSettings = {
  movementSpeedMultiplier: 1,
  showFpsCounter: false,
  terrain: {
    ...VISUAL.terrain,
    dirty: false,
  } as TerrainDevSettings,
  clouds: {
    ...CLOUD_DEV_DEFAULTS,
    dirty: false,
    liveDirty: false,
  } as CloudDevSettings,
  water: { ...VISUAL.water } as WaterDevSettings,
  grass: {
    windStrength: VISUAL.grass.windStrength,
    windSpeed: VISUAL.grass.windSpeed,
    thinningR0: VISUAL.grass.thinningR0,
    thinningR1: VISUAL.grass.thinningR1,
    thinningPMin: VISUAL.grass.thinningPMin,
    bladeMinScale: VISUAL.grass.bladeMinScale,
    bladeMaxScale: VISUAL.grass.bladeMaxScale,
    enabled: true,
    dirty: false,
  } as GrassDevSettings,
  renderDebug: {
    hideTerrain: false,
    hideWater: false,
    hideClouds: false,
    hideMapProps: false,
    hideGrass: false,
    hideSky: false,
    disableBloom: false,
    disableShadows: false,
    disableAa: false,
    disableGodRays: false,
    disableDof: false,
    logGpuPeriodic: false,
    logNightHdri: false,
  } satisfies RenderDebugSettings,
};
