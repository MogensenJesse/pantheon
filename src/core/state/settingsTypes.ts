// src/core/state/settingsTypes.ts — runtime + DEV settings interfaces

import type { FlowerSettings } from '../../world/grass/config/flowerConfig';
import type {
  GrassRingAuthored,
  GrassRingDerived,
} from '../../world/grass/config/grassFieldMetrics';
import type {
  TerrainBiomeTuneMap,
  TerrainSnowTune,
  TerrainSolidColorMap,
} from '../../world/terrain/config/terrainBiomeTuning';

/** Author-tuned ring inputs (radius, density, blade width, segments). */
export type GrassRingTune = GrassRingAuthored;

/** GPU layout fields derived from ring inputs — see syncAllGrassRingsDerived(). */
export type GrassRingDerivedLayout = Pick<
  GrassRingDerived,
  | 'innerRadius'
  | 'outerRadius'
  | 'tileSize'
  | 'bladesPerSide'
  | 'instanceCount'
  | 'fadeBandM'
  | 'fadeInBandM'
>;

export interface GrassFoliageLightingSettings {
  wrapStrength: number;
  hemisphereStrength: number;
  skyTint: string;
  groundTint: string;
  backlightStrength: number;
  backlightPunchThrough: number;
  backlightTint: string;
}

export interface GrassDevSettings {
  rings: [GrassRingTune, GrassRingTune, GrassRingTune];
  ringDerived: [GrassRingDerivedLayout, GrassRingDerivedLayout, GrassRingDerivedLayout];
  maxInstancesPerRing: number;
  /** Hard cap on blades along one tile edge (limits wrap-tile / grass reach). */
  maxBladesPerSide: number;
  /** Compact frustum tile cull (skip off-screen T×T cells before terrain sample). */
  tileCullEnabled: boolean;
  tileCullSize: number;
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
  /** LOD0→LOD1 outer fade-out (m); next ring starts full at this ring’s full boundary. */
  ringFadeBandM: number;
  /** LOD1→LOD2 outer fade-out (m); also used for LOD2’s far soft edge. */
  ringFadeBandLod12M: number;
  /** LOD2 inner fade-in (m) at the mid/far boundary. */
  ringFadeInLod2M: number;
  surfaceBias: number;
  trailGrowthRate: number;
  trailMinScale: number;
  trailRadius: number;
  trailKDown: number;
  playerGlowMul: number;
  foliageLighting: GrassFoliageLightingSettings;
  baseColor: string;
  tipColor: string;
  enabled: boolean;
  /** DEV: draw every grid slot false-colored by cull reason. */
  cullDebug: boolean;
  /** DEV: false-color blades by LOD ring (green / blue / magenta). */
  lodColorDebug: boolean;
  dirty: boolean;
  flowers: FlowerSettings;
}

export interface GodraysHorizonDevSettings {
  /** Terrain-silhouette occlusion enabled; off falls back to flat-ground (horizon = -90°). */
  enabled: boolean;
  maxDistanceM: number;
  sampleCount: number;
  rayFanCount: number;
  rayFanSpreadDeg: number;
  smoothRatePerSec: number;
  hardOccludeMarginDeg: number;
}

export interface RenderDebugSettings {
  hideTerrain: boolean;
  hideWater: boolean;
  hideMapProps: boolean;
  hideGrass: boolean;
  hideSky: boolean;
  hideClouds: boolean;
  disableBloom: boolean;
  disableShadows: boolean;
  disableAa: boolean;
  disableGodRays: boolean;
  disableDof: boolean;
  disableGrade: boolean;
  disableFsr: boolean;
  disableHaze: boolean;
  disableShoreDepth: boolean;
  logGpuPeriodic: boolean;
}

export interface TerrainDevSettings {
  biomes: TerrainBiomeTuneMap;
  solidColors: TerrainSolidColorMap;
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
  fogBypassStrength: number;
  mapBoundsFadeM: number;
  openOceanDepthM: number;
}

export interface WaterTideDevSettings {
  enabled: boolean;
  waveSpeed: number;
  waveAmplitude: number;
  foamDepth: number;
  foamColor: string;
  foamRippleAmplitude: number;
  foamRippleScale: number;
  foamRippleSpeed: number;
  foamPatchVariation: number;
  foamPatchScale: number;
  foamOpacityMin: number;
  foamDepthMinRatio: number;
  foamFogHazeStrength: number;
  foamFogColorTint: number;
  foamWaterlineBias: number;
}

export interface WaterDevSettings {
  size: number;
  alpha: number;
  distortionDay: number;
  distortionNight: number;
  /** Signed mirror-plane offset (m) — negative lifts the plane, positive drops it. */
  reflectionPlaneOffsetM: number;
  /** Reflector resolution ceiling (adaptive quality scales below this inland). */
  resolutionScale: number;
  shoreDepth: WaterShoreDevSettings;
  tide: WaterTideDevSettings;
}

/** Mutable mirror of VISUAL.postfx.cohesion (nested shape matches shipped config). */
export interface PostFxCohesionDevSettings {
  enabled: boolean;
  goldenHourPower: number;
  bloomSceneWeight: { atNoon: number; atGoldenHour: number };
  godraysWeight: { atNoon: number; atGoldenHour: number };
  vignetteDarknessBleed: number;
}

/** Mutable mirror of VISUAL.postfx.grade (nested shape matches shipped config). */
export interface PostFxGradeDevSettings {
  enabled: boolean;
  saturation: number;
  contrast: number;
  lift: { r: number; g: number; b: number };
  elevation: {
    saturation: { atNoon: number; atGoldenHour: number };
    contrast: { atNoon: number; atGoldenHour: number };
    warmth: { atNoon: number; atGoldenHour: number };
  };
  warmthTint: string;
  lut: {
    enabled: boolean;
    path: string | null;
    size: number;
    strength: number;
  };
}

export interface PostFxDevSettings {
  cohesion: PostFxCohesionDevSettings;
  grade: PostFxGradeDevSettings;
}

export interface RuntimeSettings {
  terrain: TerrainDevSettings;
  water: WaterDevSettings;
  grass: GrassDevSettings;
  postfx: PostFxDevSettings;
}

export interface DevDebugSettings {
  movementSpeedMultiplier: number;
  showFpsCounter: boolean;
  /** DEV: allow orbit pitch down to straight overhead (default floor is ~8.6° above horizon). */
  unconstrainedCameraPitch: boolean;
  godraysHorizon: GodraysHorizonDevSettings;
  renderDebug: RenderDebugSettings;
}

/** Flat combined view used by DEV panels (bridges runtime + debug). */
export interface DevSettings extends DevDebugSettings, RuntimeSettings {}
