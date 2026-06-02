// src/core/GameState.ts

import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { syncGrassFieldDerived } from '../world/grass/grassFieldMetrics';
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
  lodFarSegments: number;
  lodDualDraw: boolean;
  /** Visible grass extent from player (m); thinning / LOD outer ring. */
  fieldRadius: number;
  /** LOD0 disk radius (m). */
  lod0Radius: number;
  /** Target blades per m² on the wrap tile. */
  densityPerM2: number;
  /** Repeating wrap patch size (m); grid sized with density, not fieldRadius. */
  wrapTileExtentM: number;
  maxInstances: number;
  /** Derived — see syncGrassFieldDerived(). */
  tileSize: number;
  bladesPerSide: number;
  lodRadius: number;
  thinningR0: number;
  thinningR1: number;
  bladeWidth: number;
  bladeHeight: number;
  windStrength: number;
  windSpeed: number;
  thinningPMin: number;
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
  debugMaskViz: boolean;
  enabled: boolean;
  dirty: boolean;
}

/** DEV Tier 0 — grass compute vs draw isolation and timing. */
export interface GrassPerfSettings {
  /** Draw grass with last SSBO; skip computeUpdate (isolate GPU draw cost). */
  skipCompute: boolean;
  /** On-screen compute timing overlay. */
  showPerfHud: boolean;
  /** console.info grass perf every 3s. */
  logPerfPeriodic: boolean;
  /** Color blades by SSBO slot (validate LOD remap in vertex shader). */
  debugLodSlots: boolean;
  /** Color near = LOD0 green, far = LOD1 blue (Tier 3B dual draw). */
  debugLodRings: boolean;
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
    lodFarSegments: VISUAL.grass.lodFarSegments,
    lodDualDraw: VISUAL.grass.lodDualDraw,
    fieldRadius: VISUAL.grass.fieldRadius,
    lod0Radius: VISUAL.grass.lod0Radius,
    densityPerM2: VISUAL.grass.densityPerM2,
    wrapTileExtentM: VISUAL.grass.wrapTileExtentM,
    maxInstances: VISUAL.grass.maxInstances,
    tileSize: 0,
    bladesPerSide: 0,
    lodRadius: 0,
    thinningR0: 0,
    thinningR1: 0,
    bladeWidth: VISUAL.grass.bladeWidth,
    bladeHeight: VISUAL.grass.bladeHeight,
    windStrength: VISUAL.grass.windStrength,
    windSpeed: VISUAL.grass.windSpeed,
    thinningPMin: VISUAL.grass.thinningPMin,
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
    debugMaskViz: false,
    enabled: true,
    dirty: false,
  } as GrassDevSettings,
  grassPerf: {
    skipCompute: false,
    showPerfHud: false,
    logPerfPeriodic: false,
    debugLodSlots: false,
    debugLodRings: false,
  } as GrassPerfSettings,
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

syncGrassFieldDerived(devSettings.grass);
syncGrassFieldDerived(VISUAL.grass as unknown as GrassDevSettings);
