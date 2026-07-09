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
  opacity: number;
  windSpeed: number;
  windDirectionDeg: number;
  revealMinCoverage: number;
  revealMaxCoverage: number;
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
    typeWeights: { cumulus: 0.7, stratus: 0.2, cirrus: 0.1 },
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

/** Shipped defaults from visualTuning.ts. */
export function readCloudSettings(): CloudSettings {
  const c = VISUAL.clouds;
  return {
    enabled: c.enabled,
    preset: c.preset,
    seed: c.seed,
    cloudCount: c.cloudCount,
    particlesPerCloud: c.particlesPerCloud,
    cloudBaseY: c.cloudBaseY,
    altitudeJitter: c.altitudeJitter,
    spread: c.spread,
    opacity: c.opacity,
    windSpeed: c.windSpeed,
    windDirectionDeg: c.windDirectionDeg,
    revealMinCoverage: c.revealMinCoverage,
    revealMaxCoverage: c.revealMaxCoverage,
  };
}

export function getCloudPreset(id: CloudPresetId): CloudPreset {
  return CLOUD_PRESETS[id];
}

export function resolveActiveCloudPreset(settings: CloudSettings = readCloudSettings()): CloudPreset {
  return getCloudPreset(settings.preset);
}

/** Cluster count after preset coverage scaling (minimum 0 when coverage is 0). */
export function effectiveCloudCount(
  settings: CloudSettings = readCloudSettings(),
  preset: CloudPreset = resolveActiveCloudPreset(settings),
): number {
  return Math.max(0, Math.round(settings.cloudCount * preset.coverage));
}
