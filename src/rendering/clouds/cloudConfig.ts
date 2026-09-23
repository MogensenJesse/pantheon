// src/rendering/clouds/cloudConfig.ts — types, presets, and VISUAL.clouds accessors
import { VISUAL } from '../../config/visualTuning';

/** Shipped preset ids — maps to skill cloud-type mixes scaled for the 800 m world. */
export type CloudPresetId =
  | 'clearDay'
  | 'partlyCloudy'
  | 'overcast'
  | 'sunset'
  | 'dramatic'
  | 'highCirrus';

export type CloudGenus = 'cumulus' | 'stratus' | 'cirrus';

export type CloudLayerId = 'low' | 'high';

/** Relative weights when picking a genus per cloud cluster (need not sum to 1). */
export interface CloudTypeWeights {
  cumulus: number;
  stratus: number;
  cirrus: number;
}

/** Tileable weather-map FBM parameters. */
export interface WeatherSettings {
  /** Noise cell size in world meters. */
  cellM: number;
  octaves: number;
  /** Density soft threshold width (0–1). */
  softness: number;
  /** Octave drift speed for evolving coverage. */
  evolveSpeed: number;
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

/**
 * Preset drives coverage + genus mix.
 * Counts/altitude default from VISUAL.clouds; optional `layerCounts` / `layerParticles`
 * override per-layer cluster targets and puff ranges for that preset only.
 */
export interface CloudPreset {
  id: CloudPresetId;
  label: string;
  /** 0–1 — weather-map density threshold (and fallback when layerCoverage omitted). */
  coverage: number;
  /**
   * Optional per-layer coverage thresholds for the weather map.
   * When omitted, both layers use `coverage`.
   */
  layerCoverage?: { low: number; high: number };
  /**
   * Optional per-layer cluster targets. When omitted, uses VISUAL.clouds layers.*.cloudCount.
   */
  layerCounts?: { low?: number; high?: number };
  /**
   * Optional per-layer particle min/max. When omitted, uses VISUAL.clouds layers.*.particlesMin/Max.
   */
  layerParticles?: {
    low?: { min: number; max: number };
    high?: { min: number; max: number };
  };
  typeWeights: CloudTypeWeights;
}

export interface CloudSettings {
  enabled: boolean;
  preset: CloudPresetId;
  seed: number;
  spread: number;
  /** Soft opacity fade width at wind-wrap domain edges (m). */
  edgeFadeM: number;
  opacity: number;
  /** View-facing alpha power — higher = softer / more faded rims. */
  facingPow: number;
  /** N·V smoothstep width for soft-particle rim dissolve. */
  edgeSoftness: number;
  /** Extra soft-particle N·V power (adds to facingPow). */
  radialSoftness: number;
  /** triNoise3D rim / silhouette carve strength (0–1). */
  wispStrength: number;
  wispScaleA: number;
  wispScaleB: number;
  wispSpeed: number;
  /** Flatten wrap/SSS lighting (0–1). */
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
  /** Warm golden palette strength at low sun (0–1). */
  goldenTintStrength: number;
  /** Dawn/dusk directional sun catch on the lit face (0–1). */
  sunCatchStrength: number;
  /** Lift over peaks + soft-fade residual terrain intersection. */
  terrainInteractionEnabled: boolean;
  terrainClearanceM: number;
  terrainFadeBelowM: number;
  weather: WeatherSettings;
  layers: { low: CloudLayerSettings; high: CloudLayerSettings };
  maxInstances: number;
  /** Flat aliases for RangeSpec / DEV panel (mirror nested weather/layers). */
  weatherCellM: number;
  weatherOctaves: number;
  weatherSoftness: number;
  weatherEvolveSpeed: number;
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

export const CLOUD_PRESETS: Record<CloudPresetId, CloudPreset> = {
  clearDay: {
    id: 'clearDay',
    label: 'Clear day',
    coverage: 0.15,
    layerCoverage: { low: 0.1, high: 0.2 },
    typeWeights: { cumulus: 0.85, stratus: 0.1, cirrus: 0.05 },
  },
  partlyCloudy: {
    id: 'partlyCloudy',
    label: 'Partly cloudy',
    coverage: 0.45,
    layerCoverage: { low: 0.4, high: 0.35 },
    typeWeights: { cumulus: 0, stratus: 0.5, cirrus: 0.5 },
  },
  overcast: {
    id: 'overcast',
    label: 'Overcast',
    coverage: 0.85,
    layerCoverage: { low: 0.8, high: 0.5 },
    typeWeights: { cumulus: 0.1, stratus: 0.85, cirrus: 0.05 },
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset stratocumulus',
    coverage: 0.4,
    layerCoverage: { low: 0.35, high: 0.4 },
    typeWeights: { cumulus: 0.35, stratus: 0.55, cirrus: 0.1 },
  },
  dramatic: {
    id: 'dramatic',
    label: 'Dramatic storm',
    coverage: 0.72,
    layerCoverage: { low: 0.78, high: 0.55 },
    // ~1.8x global layer budgets so banks fill more of the sky (mid estimate < maxInstances).
    layerCounts: { low: 52, high: 24 },
    layerParticles: {
      low: { min: 14, max: 34 },
      high: { min: 18, max: 42 },
    },
    typeWeights: { cumulus: 0.75, stratus: 0.2, cirrus: 0.05 },
  },
  highCirrus: {
    id: 'highCirrus',
    label: 'High cirrus',
    coverage: 0.3,
    layerCoverage: { low: 0.05, high: 0.55 },
    typeWeights: { cumulus: 0.05, stratus: 0.15, cirrus: 0.8 },
  },
} as const;

/** Shipped defaults from visualTuning.ts — built once (VISUAL is static at runtime). */
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

/** Copy nested weather/layers onto flat RangeSpec aliases (and vice versa). */
export function syncCloudSettingsAliases(settings: CloudSettings): void {
  settings.weatherCellM = settings.weather.cellM;
  settings.weatherOctaves = settings.weather.octaves;
  settings.weatherSoftness = settings.weather.softness;
  settings.weatherEvolveSpeed = settings.weather.evolveSpeed;
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

/** Apply flat alias overrides into nested weather/layers. */
export function applyFlatAliasesToNested(
  settings: CloudSettings,
  overrides: Partial<CloudSettings>,
): void {
  if (overrides.weatherCellM !== undefined) settings.weather.cellM = overrides.weatherCellM;
  if (overrides.weatherOctaves !== undefined) settings.weather.octaves = overrides.weatherOctaves;
  if (overrides.weatherSoftness !== undefined) settings.weather.softness = overrides.weatherSoftness;
  if (overrides.weatherEvolveSpeed !== undefined) {
    settings.weather.evolveSpeed = overrides.weatherEvolveSpeed;
  }
  if (overrides.lowBaseY !== undefined) settings.layers.low.baseY = overrides.lowBaseY;
  if (overrides.lowAltitudeJitter !== undefined) {
    settings.layers.low.jitter = overrides.lowAltitudeJitter;
  }
  if (overrides.lowCloudCount !== undefined) settings.layers.low.cloudCount = overrides.lowCloudCount;
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
  const weather: WeatherSettings = {
    cellM: c.weather.cellM,
    octaves: c.weather.octaves,
    softness: c.weather.softness,
    evolveSpeed: c.weather.evolveSpeed,
  };
  const layers = {
    low: readLayer(c.layers.low),
    high: readLayer(c.layers.high),
  };
  _shippedCloudSettings = {
    enabled: c.enabled,
    preset: c.preset,
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
    terrainInteractionEnabled: c.terrainInteractionEnabled,
    terrainClearanceM: c.terrainClearanceM,
    terrainFadeBelowM: c.terrainFadeBelowM,
    weather,
    layers,
    maxInstances: c.maxInstances,
    weatherCellM: weather.cellM,
    weatherOctaves: weather.octaves,
    weatherSoftness: weather.softness,
    weatherEvolveSpeed: weather.evolveSpeed,
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

export function getCloudPreset(id: CloudPresetId): CloudPreset {
  return CLOUD_PRESETS[id];
}

export function resolveActiveCloudPreset(
  settings: CloudSettings = readCloudSettings(),
): CloudPreset {
  return getCloudPreset(settings.preset);
}

/** Per-layer coverage; falls back to preset.coverage when layerCoverage omitted. */
export function resolveLayerCoverage(
  preset: CloudPreset,
  layer: CloudLayerId,
): number {
  return preset.layerCoverage?.[layer] ?? preset.coverage;
}

/** Resolve cluster target for a layer (preset override or VISUAL.clouds default). */
export function resolveLayerCloudCount(
  settings: CloudSettings,
  preset: CloudPreset,
  layer: CloudLayerId,
): number {
  const override = preset.layerCounts?.[layer];
  if (override !== undefined) return Math.max(0, Math.round(override));
  return Math.max(0, Math.round(settings.layers[layer].cloudCount));
}

/** Resolve particle min/max for a layer (preset override or VISUAL.clouds default). */
export function resolveLayerParticles(
  settings: CloudSettings,
  preset: CloudPreset,
  layer: CloudLayerId,
): { min: number; max: number } {
  const override = preset.layerParticles?.[layer];
  if (override) {
    return {
      min: Math.max(1, Math.round(override.min)),
      max: Math.max(1, Math.round(override.max)),
    };
  }
  const layerSettings = settings.layers[layer];
  return {
    min: layerSettings.particlesMin,
    max: layerSettings.particlesMax,
  };
}

/** Target cluster count across low + high layers (weather may place fewer). */
export function effectiveCloudCount(
  settings: CloudSettings = readCloudSettings(),
  preset: CloudPreset = resolveActiveCloudPreset(settings),
): number {
  return Math.max(
    0,
    resolveLayerCloudCount(settings, preset, 'low') +
      resolveLayerCloudCount(settings, preset, 'high'),
  );
}

/** Mid-density instance estimate before weather/spacing thrift, capped by maxInstances. */
export function estimateCloudInstanceCount(
  settings: CloudSettings = readCloudSettings(),
  preset: CloudPreset = resolveActiveCloudPreset(settings),
): number {
  const mid = (min: number, max: number) => Math.round((min + max) * 0.5);
  const lowCount = resolveLayerCloudCount(settings, preset, 'low');
  const highCount = resolveLayerCloudCount(settings, preset, 'high');
  const lowP = resolveLayerParticles(settings, preset, 'low');
  const highP = resolveLayerParticles(settings, preset, 'high');
  const raw =
    lowCount * mid(lowP.min, lowP.max) + highCount * mid(highP.min, highP.max);
  return Math.max(0, Math.min(settings.maxInstances, raw));
}