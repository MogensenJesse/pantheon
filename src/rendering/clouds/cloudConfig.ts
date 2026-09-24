// src/rendering/clouds/cloudConfig.ts - types and VISUAL.clouds accessors (single baked default)
import { VISUAL } from '../../config/visualTuning';

export type CloudGenus = 'cumulus' | 'stratus' | 'cirrus';

export type CloudLayerId = 'low' | 'high';

/** Relative weights when picking a genus per cloud cluster (need not sum to 1). */
export interface CloudTypeWeights {
  cumulus: number;
  stratus: number;
  cirrus: number;
}

/** Tileable coverage/bank-noise FBM parameters (gen-time placement). Octaves frozen in generator. */
export interface CoverageNoiseSettings {
  /** Noise cell size in world meters. */
  cellM: number;
  /** Density soft threshold width (0-1). */
  softness: number;
}

/** Per-layer placement / sizing. */
export interface CloudLayerSettings {
  baseY: number;
  jitter: number;
  cloudCount: number;
  particlesMin: number;
  particlesMax: number;
  sizeMul: number;
  terrainLift: boolean;
}

export interface CloudSettings {
  enabled: boolean;
  /** Global coverage threshold (0-1); layerCoverage overrides per deck when set. */
  coverage: number;
  layerCoverage: { low: number; high: number };
  typeWeights: CloudTypeWeights;
  seed: number;
  spread: number;
  /** Soft opacity fade width at wind-wrap domain edges (m). */
  edgeFadeM: number;
  opacity: number;
  /** View-facing alpha power - higher = softer / more faded rims. */
  facingPow: number;
  /** N.V smoothstep width for soft-particle rim dissolve. */
  edgeSoftness: number;
  /** Extra soft-particle N.V power (adds to facingPow). */
  radialSoftness: number;
  /** triNoise3D rim / silhouette carve strength (0-1). */
  wispStrength: number;
  wispScaleA: number;
  wispScaleB: number;
  wispSpeed: number;
  /** Flatten wrap/SSS lighting (0-1). */
  lightFlatten: number;
  windSpeed: number;
  windDirectionDeg: number;
  revealMinCoverage: number;
  revealMaxCoverage: number;
  /** Soft cast shadows onto terrain. */
  castShadows: boolean;
  /** Receive sun shadows from terrain / props. */
  receiveShadows: boolean;
  /** Min lit fraction of sun term in full shadow. */
  shadowFloor: number;
  /** Y lift for shadow map samples (m). */
  shadowSampleLiftM: number;
  /** Night valley term mix (0 = exempt, 1 = full). Noon aerial is ground-only. */
  hazeMix: number;
  /** Floor for world light scale (night/dawn readable). */
  lightScaleMin: number;
  /** Warm golden palette strength at low sun (0-1). */
  goldenTintStrength: number;
  /** Dawn/dusk directional sun catch on the lit face (0-1). */
  sunCatchStrength: number;
  /** Blend sphere normal to cluster mass normal (0-1). */
  massNormalMix: number;
  /** Darken flat cloud bases from aCloudMass.y (0-1). */
  baseShade: number;
  /** In-mass self-shadow power on the sun term. */
  selfShadow: number;
  /** Henyey-Greenstein silver-lining strength. */
  silverStrength: number;
  /** HG anisotropy g (~0.6 forward scatter). */
  silverG: number;
  terrainInteractionEnabled: boolean;
  terrainClearanceM: number;
  terrainFadeBelowM: number;
  coverageNoise: CoverageNoiseSettings;
  layers: { low: CloudLayerSettings; high: CloudLayerSettings };
  maxInstances: number;
  /** Flat aliases for RangeSpec / DEV panel (mirror nested coverageNoise/layers). */
  coverageNoiseCellM: number;
  coverageNoiseSoftness: number;
  lowBaseY: number;
  lowAltitudeJitter: number;
  lowCloudCount: number;
  lowParticlesMin: number;
  lowParticlesMax: number;
  lowSizeMul: number;
  highBaseY: number;
  highAltitudeJitter: number;
  highCloudCount: number;
  highParticlesMin: number;
  highParticlesMax: number;
  highSizeMul: number;
}

/** Shipped defaults from visualTuning.ts - built once (VISUAL is static at runtime). */
let _shippedCloudSettings: CloudSettings | null = null;

function readLayer(raw: {
  baseY: number;
  jitter: number;
  cloudCount: number;
  particlesMin: number;
  particlesMax: number;
  sizeMul: number;
  terrainLift: boolean;
}): CloudLayerSettings {
  return {
    baseY: raw.baseY,
    jitter: raw.jitter,
    cloudCount: raw.cloudCount,
    particlesMin: raw.particlesMin,
    particlesMax: raw.particlesMax,
    sizeMul: raw.sizeMul,
    terrainLift: raw.terrainLift,
  };
}

/** Copy nested coverageNoise/layers onto flat RangeSpec aliases. */
export function syncCloudSettingsAliases(settings: CloudSettings): void {
  settings.coverageNoiseCellM = settings.coverageNoise.cellM;
  settings.coverageNoiseSoftness = settings.coverageNoise.softness;
  settings.lowBaseY = settings.layers.low.baseY;
  settings.lowAltitudeJitter = settings.layers.low.jitter;
  settings.lowCloudCount = settings.layers.low.cloudCount;
  settings.lowParticlesMin = settings.layers.low.particlesMin;
  settings.lowParticlesMax = settings.layers.low.particlesMax;
  settings.lowSizeMul = settings.layers.low.sizeMul;
  settings.highBaseY = settings.layers.high.baseY;
  settings.highAltitudeJitter = settings.layers.high.jitter;
  settings.highCloudCount = settings.layers.high.cloudCount;
  settings.highParticlesMin = settings.layers.high.particlesMin;
  settings.highParticlesMax = settings.layers.high.particlesMax;
  settings.highSizeMul = settings.layers.high.sizeMul;
}

/** Apply flat alias overrides into nested coverageNoise/layers. */
export function applyFlatAliasesToNested(
  settings: CloudSettings,
  overrides: Partial<CloudSettings>,
): void {
  if (overrides.coverageNoiseCellM !== undefined)
    settings.coverageNoise.cellM = overrides.coverageNoiseCellM;
  if (overrides.coverageNoiseSoftness !== undefined)
    settings.coverageNoise.softness = overrides.coverageNoiseSoftness;
  if (overrides.lowBaseY !== undefined) settings.layers.low.baseY = overrides.lowBaseY;
  if (overrides.lowAltitudeJitter !== undefined) {
    settings.layers.low.jitter = overrides.lowAltitudeJitter;
  }
  if (overrides.lowCloudCount !== undefined)
    settings.layers.low.cloudCount = overrides.lowCloudCount;
  if (overrides.lowParticlesMin !== undefined) {
    settings.layers.low.particlesMin = overrides.lowParticlesMin;
  }
  if (overrides.lowParticlesMax !== undefined) {
    settings.layers.low.particlesMax = overrides.lowParticlesMax;
  }
  if (overrides.lowSizeMul !== undefined) settings.layers.low.sizeMul = overrides.lowSizeMul;
  if (overrides.highBaseY !== undefined) settings.layers.high.baseY = overrides.highBaseY;
  if (overrides.highAltitudeJitter !== undefined) {
    settings.layers.high.jitter = overrides.highAltitudeJitter;
  }
  if (overrides.highCloudCount !== undefined) {
    settings.layers.high.cloudCount = overrides.highCloudCount;
  }
  if (overrides.highParticlesMin !== undefined) {
    settings.layers.high.particlesMin = overrides.highParticlesMin;
  }
  if (overrides.highParticlesMax !== undefined) {
    settings.layers.high.particlesMax = overrides.highParticlesMax;
  }
  if (overrides.highSizeMul !== undefined) settings.layers.high.sizeMul = overrides.highSizeMul;
  syncCloudSettingsAliases(settings);
}

export function readCloudSettings(): CloudSettings {
  if (_shippedCloudSettings) return _shippedCloudSettings;
  const c = VISUAL.clouds;
  const rawNest = (c as { coverageNoise?: { cellM: number; softness: number } }).coverageNoise;
  if (!rawNest) {
    throw new Error('VISUAL.clouds.coverageNoise is required');
  }
  const coverageNoise: CoverageNoiseSettings = {
    cellM: rawNest.cellM,
    softness: rawNest.softness,
  };
  const layers = {
    low: readLayer(c.layers.low),
    high: readLayer(c.layers.high),
  };
  const layerCoverage = {
    low: (c as { layerCoverage?: { low: number; high: number } }).layerCoverage?.low ?? c.coverage,
    high:
      (c as { layerCoverage?: { low: number; high: number } }).layerCoverage?.high ?? c.coverage,
  };
  const typeWeights = {
    cumulus: c.typeWeights.cumulus,
    stratus: c.typeWeights.stratus,
    cirrus: c.typeWeights.cirrus,
  };
  _shippedCloudSettings = {
    enabled: c.enabled,
    coverage: c.coverage,
    layerCoverage,
    typeWeights,
    seed: c.seed,
    spread: c.spread,
    edgeFadeM: c.edgeFadeM,
    opacity: c.opacity,
    facingPow: c.facingPow,
    edgeSoftness: c.edgeSoftness,
    radialSoftness: c.radialSoftness,
    wispStrength: c.wispStrength,
    wispScaleA: c.wispScaleA,
    wispScaleB: c.wispScaleB,
    wispSpeed: c.wispSpeed,
    lightFlatten: c.lightFlatten,
    windSpeed: c.windSpeed,
    windDirectionDeg: c.windDirectionDeg,
    revealMinCoverage: c.revealMinCoverage,
    revealMaxCoverage: c.revealMaxCoverage,
    castShadows: c.castShadows,
    receiveShadows: c.receiveShadows,
    shadowFloor: c.shadowFloor,
    shadowSampleLiftM: c.shadowSampleLiftM,
    hazeMix: c.hazeMix,
    lightScaleMin: c.lightScaleMin,
    goldenTintStrength: c.goldenTintStrength,
    sunCatchStrength: c.sunCatchStrength,
    massNormalMix: c.massNormalMix,
    baseShade: c.baseShade,
    selfShadow: c.selfShadow,
    silverStrength: c.silverStrength,
    silverG: c.silverG,
    terrainInteractionEnabled: c.terrainInteractionEnabled,
    terrainClearanceM: c.terrainClearanceM,
    terrainFadeBelowM: c.terrainFadeBelowM,
    coverageNoise,
    layers,
    maxInstances: c.maxInstances,
    coverageNoiseCellM: coverageNoise.cellM,
    coverageNoiseSoftness: coverageNoise.softness,
    lowBaseY: layers.low.baseY,
    lowAltitudeJitter: layers.low.jitter,
    lowCloudCount: layers.low.cloudCount,
    lowParticlesMin: layers.low.particlesMin,
    lowParticlesMax: layers.low.particlesMax,
    lowSizeMul: layers.low.sizeMul,
    highBaseY: layers.high.baseY,
    highAltitudeJitter: layers.high.jitter,
    highCloudCount: layers.high.cloudCount,
    highParticlesMin: layers.high.particlesMin,
    highParticlesMax: layers.high.particlesMax,
    highSizeMul: layers.high.sizeMul,
  };
  return _shippedCloudSettings;
}

/** Per-layer coverage; falls back to settings.coverage when layerCoverage omitted. */
export function resolveLayerCoverage(settings: CloudSettings, layer: CloudLayerId): number {
  return settings.layerCoverage?.[layer] ?? settings.coverage;
}

/** Resolve cluster target for a layer from VISUAL / live settings. */
export function resolveLayerCloudCount(settings: CloudSettings, layer: CloudLayerId): number {
  return Math.max(0, Math.round(settings.layers[layer].cloudCount));
}

/** Resolve particle min/max for a layer from VISUAL / live settings. */
export function resolveLayerParticles(
  settings: CloudSettings,
  layer: CloudLayerId,
): { min: number; max: number } {
  const layerSettings = settings.layers[layer];
  return {
    min: layerSettings.particlesMin,
    max: layerSettings.particlesMax,
  };
}

/** Target cluster count across low + high layers. */
export function effectiveCloudCount(settings: CloudSettings = readCloudSettings()): number {
  return Math.max(
    0,
    resolveLayerCloudCount(settings, 'low') + resolveLayerCloudCount(settings, 'high'),
  );
}

/** Mid-density instance estimate, capped by maxInstances. */
export function estimateCloudInstanceCount(settings: CloudSettings = readCloudSettings()): number {
  const mid = (min: number, max: number) => Math.round((min + max) * 0.5);
  const lowCount = resolveLayerCloudCount(settings, 'low');
  const highCount = resolveLayerCloudCount(settings, 'high');
  const lowP = resolveLayerParticles(settings, 'low');
  const highP = resolveLayerParticles(settings, 'high');
  const raw = lowCount * mid(lowP.min, lowP.max) + highCount * mid(highP.min, highP.max);
  return Math.max(0, Math.min(settings.maxInstances, raw));
}
