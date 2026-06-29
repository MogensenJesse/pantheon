// src/core/GameState.ts

import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { cloneFlowerSettings, type FlowerSettings } from '../world/grass/config/flowerConfig';
import { syncAllGrassRingsDerived } from '../world/grass/config/grassFieldMetrics';

export interface GameState {
  energy: number;
  energyCap: number;
  /** Residue orbs picked up — drives cumulative world night lightness. */
  orbsAbsorbed: number;
  phase: number;
  memoryFragments: number[];
}

export function createGameState(): GameState {
  return {
    energy: 0,
    energyCap: PHASE0.ENERGY_CAP,
    orbsAbsorbed: 0,
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
  baseWindShade: number;
  baseShadeHeight: number;
  baseBending: number;
  biomeGrassThreshold: number;
  biomeGrassFadeWidth: number;
  transitionMinBladeScale: number;
  surfaceBias: number;
  trailGrowthRate: number;
  trailMinScale: number;
  trailRadius: number;
  trailKDown: number;
  playerGlowMul: number;
  wrapStrength: number;
  hemisphereStrength: number;
  skyTint: string;
  groundTint: string;
  backlightStrength: number;
  backlightPunchThrough: number;
  backlightTint: string;
  baseColor: string;
  tipColor: string;
  enabled: boolean;
  dirty: boolean;
  flowers: FlowerSettings;
}

export interface RenderDebugSettings {
  hideTerrain: boolean;
  hideWater: boolean;
  hideMapProps: boolean;
  hideGrass: boolean;
  hideSky: boolean;
  disableBloom: boolean;
  disableShadows: boolean;
  disableAa: boolean;
  disableGodRays: boolean;
  disableDof: boolean;
  disableHaze: boolean;
  disableShoreDepth: boolean;
  logGpuPeriodic: boolean;
}

import type {
  TerrainBiomeTuneMap,
  TerrainSnowTune,
} from '../world/terrain/config/terrainBiomeTuning';

export interface TerrainDevSettings {
  biomes: TerrainBiomeTuneMap;
  snow: TerrainSnowTune;
  displacementEnabled: boolean;
  /** DEV: draw clipmap debug bounds in play mode. */
  showLodBounds: boolean;
  dirty: boolean;
}

/** Mutable copy of VISUAL.water for live dev sliders. */
export interface WaterShoreDevSettings {
  enabled: boolean;
  absorption: number;
  coastFadeM: number;
  shallowDepthM: number;
  refractionDepthM: number;
  shallowColor: string;
  shallowColorNight: string;
  shadowOpacityBoost: number;
  refractionStrength: number;
  refractionOffset: number;
  refractionOpacity: number;
}

export interface WaterDevSettings {
  size: number;
  alpha: number;
  distortionDay: number;
  distortionNight: number;
  /** Reflector resolution ceiling (adaptive quality scales below this inland). */
  resolutionScale: number;
  shoreDepth: WaterShoreDevSettings;
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
    baseWindShade: VISUAL.grass.baseWindShade,
    baseShadeHeight: VISUAL.grass.baseShadeHeight,
    baseBending: VISUAL.grass.baseBending,
    biomeGrassThreshold: VISUAL.grass.biomeGrassThreshold,
    biomeGrassFadeWidth: VISUAL.grass.biomeGrassFadeWidth,
    transitionMinBladeScale: VISUAL.grass.transitionMinBladeScale,
    surfaceBias: VISUAL.grass.surfaceBias,
    trailGrowthRate: VISUAL.grass.trailGrowthRate,
    trailMinScale: VISUAL.grass.trailMinScale,
    trailRadius: VISUAL.grass.trailRadius,
    trailKDown: VISUAL.grass.trailKDown,
    playerGlowMul: VISUAL.grass.playerGlowMul,
    wrapStrength: VISUAL.grass.foliageLighting.wrapStrength,
    hemisphereStrength: VISUAL.grass.foliageLighting.hemisphereStrength,
    skyTint: VISUAL.grass.foliageLighting.skyTint,
    groundTint: VISUAL.grass.foliageLighting.groundTint,
    backlightStrength: VISUAL.grass.foliageLighting.backlightStrength,
    backlightPunchThrough: VISUAL.grass.foliageLighting.backlightPunchThrough,
    backlightTint: VISUAL.grass.foliageLighting.backlightTint,
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
    biomes: structuredClone(VISUAL.terrain.biomes),
    snow: { ...VISUAL.terrain.snow },
    displacementEnabled: VISUAL.terrain.displacementEnabled,
    showLodBounds: false,
    dirty: false,
  } as TerrainDevSettings,
  water: {
    size: VISUAL.water.size,
    alpha: VISUAL.water.alpha,
    distortionDay: VISUAL.water.distortionDay,
    distortionNight: VISUAL.water.distortionNight,
    resolutionScale: VISUAL.water.resolutionScale,
    shoreDepth: { ...VISUAL.water.shoreDepth },
  } satisfies WaterDevSettings,
  grass: createGrassDevSettingsFromVisual(),
  renderDebug: {
    hideTerrain: false,
    hideWater: false,
    hideMapProps: false,
    hideGrass: false,
    hideSky: false,
    disableBloom: false,
    disableShadows: false,
    disableAa: false,
    disableGodRays: false,
    disableDof: false,
    disableHaze: false,
    disableShoreDepth: false,
    logGpuPeriodic: false,
  } satisfies RenderDebugSettings,
};

syncAllGrassRingsDerived(devSettings.grass.rings, devSettings.grass.maxInstancesPerRing);
