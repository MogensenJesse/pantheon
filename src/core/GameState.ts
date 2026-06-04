// src/core/GameState.ts

import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { syncAllGrassRingsDerived } from '../world/grass/grassFieldMetrics';
import { cloneFlowerSettings, type FlowerSettings } from '../world/grass/flowers/flowerConfig';
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

export interface GrassRingDevSettings {
  /** Ring thickness (m) for this LOD level. */
  radius: number;
  densityPerM2: number;
  bladeWidth: number;
  segments: number;
  /** Derived — see syncGrassRingDerived(). */
  innerRadius: number;
  /** Derived cumulative outer edge (m). */
  outerRadius: number;
  tileSize: number;
  bladesPerSide: number;
  instanceCount: number;
}

export interface GrassDevSettings {
  rings: [GrassRingDevSettings, GrassRingDevSettings, GrassRingDevSettings];
  maxInstancesPerRing: number;
  bladeHeight: number;
  windStrength: number;
  windSpeed: number;
  cullPadNdcX: number;
  cullPadNdcYNear: number;
  cullPadNdcYFar: number;
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
  surfaceBias: number;
  trailGrowthRate: number;
  trailMinScale: number;
  trailRadius: number;
  trailKDown: number;
  playerGlowMul: number;
  baseColor: string;
  tipColor: string;
  enabled: boolean;
  dirty: boolean;
  flowers: FlowerSettings;
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

function createGrassRingDevSettings(
  ring: (typeof VISUAL.grass.rings)[number],
): GrassRingDevSettings {
  return {
    radius: ring.radius,
    densityPerM2: ring.densityPerM2,
    bladeWidth: ring.bladeWidth,
    segments: ring.segments,
    innerRadius: 0,
    outerRadius: 0,
    tileSize: 0,
    bladesPerSide: 0,
    instanceCount: 0,
  };
}

function createGrassDevSettingsFromVisual(): GrassDevSettings {
  return {
    rings: [
      createGrassRingDevSettings(VISUAL.grass.rings[0]),
      createGrassRingDevSettings(VISUAL.grass.rings[1]),
      createGrassRingDevSettings(VISUAL.grass.rings[2]),
    ],
    maxInstancesPerRing: VISUAL.grass.maxInstancesPerRing,
    bladeHeight: VISUAL.grass.bladeHeight,
    windStrength: VISUAL.grass.windStrength,
    windSpeed: VISUAL.grass.windSpeed,
    cullPadNdcX: VISUAL.grass.cullPadNdcX,
    cullPadNdcYNear: VISUAL.grass.cullPadNdcYNear,
    cullPadNdcYFar: VISUAL.grass.cullPadNdcYFar,
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
    surfaceBias: VISUAL.grass.surfaceBias,
    trailGrowthRate: VISUAL.grass.trailGrowthRate,
    trailMinScale: VISUAL.grass.trailMinScale,
    trailRadius: VISUAL.grass.trailRadius,
    trailKDown: VISUAL.grass.trailKDown,
    playerGlowMul: VISUAL.grass.playerGlowMul,
    baseColor: VISUAL.grass.baseColor,
    tipColor: VISUAL.grass.tipColor,
    enabled: true,
    dirty: false,
    flowers: cloneFlowerSettings(VISUAL.grass.flowers),
  };
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
  grass: createGrassDevSettingsFromVisual(),
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

syncAllGrassRingsDerived(devSettings.grass.rings, devSettings.grass.maxInstancesPerRing);
