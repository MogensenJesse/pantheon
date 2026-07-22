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

/** Relative weights when picking a genus per cloud cluster (need not sum to 1). */
export interface CloudTypeWeights {
  cumulus: number;
  stratus: number;
  cirrus: number;
}

/** Preset drives coverage + genus mix; counts/altitude come from VISUAL.clouds. */
export interface CloudPreset {
  id: CloudPresetId;
  label: string;
  /** 0–1 — scales effective cloud cluster count at generation time. */
  coverage: number;
  typeWeights: CloudTypeWeights;
}

export interface CloudSettings {
  enabled: boolean;
  preset: CloudPresetId;
  seed: number;
  cloudCount: number;
  particlesPerCloud: number;
  cloudBaseY: number;
  altitudeJitter: number;
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
  /** Soft cast shadows onto terrain / god-ray occlusion. */
  castShadows: boolean;
  /** Receive sun shadows from terrain / props. */
  receiveShadows: boolean;
  /** Min lit fraction of sun term in full shadow. */
  shadowFloor: number;
  /** Y lift for shadow map samples (m). */
  shadowSampleLiftM: number;
  /** Valley-haze mix (0 = exempt, 1 = full). */
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
}

export const CLOUD_PRESETS: Record<CloudPresetId, CloudPreset> = {
  clearDay: {
    id: 'clearDay',
    label: 'Clear day',
    coverage: 0.15,
    typeWeights: { cumulus: 0.85, stratus: 0.1, cirrus: 0.05 },
  },
  partlyCloudy: {
    id: 'partlyCloudy',
    label: 'Partly cloudy',
    coverage: 0.45,
    typeWeights: { cumulus: 0, stratus: 0.5, cirrus: 0.5 },
  },
  overcast: {
    id: 'overcast',
    label: 'Overcast',
    coverage: 0.85,
    typeWeights: { cumulus: 0.1, stratus: 0.85, cirrus: 0.05 },
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset stratocumulus',
    coverage: 0.4,
    typeWeights: { cumulus: 0.35, stratus: 0.55, cirrus: 0.1 },
  },
  dramatic: {
    id: 'dramatic',
    label: 'Dramatic storm',
    coverage: 0.6,
    typeWeights: { cumulus: 0.75, stratus: 0.2, cirrus: 0.05 },
  },
  highCirrus: {
    id: 'highCirrus',
    label: 'High cirrus',
    coverage: 0.3,
    typeWeights: { cumulus: 0.05, stratus: 0.15, cirrus: 0.8 },
  },
} as const;

/** Shipped defaults from visualTuning.ts — built once (VISUAL is static at runtime). */
let _shippedCloudSettings: CloudSettings | null = null;

export function readCloudSettings(): CloudSettings {
  if (_shippedCloudSettings) return _shippedCloudSettings;
  const c = VISUAL.clouds;
  _shippedCloudSettings = {
    enabled: c.enabled,
    preset: c.preset,
    seed: c.seed,
    cloudCount: c.cloudCount,
    particlesPerCloud: c.particlesPerCloud,
    cloudBaseY: c.cloudBaseY,
    altitudeJitter: c.altitudeJitter,
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

/** Cluster count after preset coverage scaling (minimum 0 when coverage is 0). */
export function effectiveCloudCount(
  settings: CloudSettings = readCloudSettings(),
  preset: CloudPreset = resolveActiveCloudPreset(settings),
): number {
  return Math.max(0, Math.round(settings.cloudCount * preset.coverage));
}
