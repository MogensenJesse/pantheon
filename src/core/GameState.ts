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
  segments: number;
  bladeWidth: number;
  bladeHeight: number;
  tileSize: number;
  bladesPerSide: number;
  windStrength: number;
  windSpeed: number;
  thinningR0: number;
  thinningR1: number;
  thinningPMin: number;
  bladeMinScale: number;
  bladeMaxScale: number;
  colorMixFactor: number;
  colorVariationStrength: number;
  aoScale: number;
  aoRimSmoothness: number;
  aoRadius: number;
  baseWindShade: number;
  baseShadeHeight: number;
  baseBending: number;
  biomeGrassThreshold: number;
  trailGrowthRate: number;
  trailMinScale: number;
  trailRadius: number;
  trailKDown: number;
  playerGlowMul: number;
  baseColor: string;
  tipColor: string;
  debugMaskViz: boolean;
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
    segments: VISUAL.grass.segments,
    bladeWidth: VISUAL.grass.bladeWidth,
    bladeHeight: VISUAL.grass.bladeHeight,
    tileSize: VISUAL.grass.tileSize,
    bladesPerSide: VISUAL.grass.bladesPerSide,
    windStrength: VISUAL.grass.windStrength,
    windSpeed: VISUAL.grass.windSpeed,
    thinningR0: VISUAL.grass.thinningR0,
    thinningR1: VISUAL.grass.thinningR1,
    thinningPMin: VISUAL.grass.thinningPMin,
    bladeMinScale: VISUAL.grass.bladeMinScale,
    bladeMaxScale: VISUAL.grass.bladeMaxScale,
    colorMixFactor: VISUAL.grass.colorMixFactor,
    colorVariationStrength: VISUAL.grass.colorVariationStrength,
    aoScale: VISUAL.grass.aoScale,
    aoRimSmoothness: VISUAL.grass.aoRimSmoothness,
    aoRadius: VISUAL.grass.aoRadius,
    baseWindShade: VISUAL.grass.baseWindShade,
    baseShadeHeight: VISUAL.grass.baseShadeHeight,
    baseBending: VISUAL.grass.baseBending,
    biomeGrassThreshold: VISUAL.grass.biomeGrassThreshold,
    trailGrowthRate: VISUAL.grass.trailGrowthRate,
    trailMinScale: VISUAL.grass.trailMinScale,
    trailRadius: VISUAL.grass.trailRadius,
    trailKDown: VISUAL.grass.trailKDown,
    playerGlowMul: VISUAL.grass.playerGlowMul,
    baseColor: VISUAL.grass.baseColor,
    tipColor: VISUAL.grass.tipColor,
    debugMaskViz: false,
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
