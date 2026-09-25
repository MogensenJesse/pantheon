// src/rendering/clouds/cloudDevState.ts — DEV live cloud tunables (layout changes need rebuild)
import { type CloudSettings, readCloudSettings } from './cloudConfig';

let devOverrides: Partial<CloudSettings> = {};

function mergeLiveCloudSettings(base: CloudSettings): CloudSettings {
  const merged: CloudSettings = {
    ...base,
    ...devOverrides,
    coverageNoise: { ...base.coverageNoise, ...devOverrides.coverageNoise },
    layers: {
      low: { ...base.layers.low, ...devOverrides.layers?.low },
      high: { ...base.layers.high, ...devOverrides.layers?.high },
    },
    layerCoverage: { ...base.layerCoverage, ...devOverrides.layerCoverage },
    typeWeights: { cumulus: 1, stratus: 0, cirrus: 0 },
  };
  const particles = Math.max(1, Math.round(merged.particles));
  merged.layers.low.particlesMin = particles;
  merged.layers.low.particlesMax = particles;
  merged.layers.high.cloudCount = 0;
  merged.layers.high.particlesMin = particles;
  merged.layers.high.particlesMax = particles;
  return merged;
}

/** Shipped look merged with DEV overrides. Deck count and coverage are read live. */
export function getLiveCloudSettings(): CloudSettings {
  const base = readCloudSettings();
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
  return mergeLiveCloudSettings(base);
}

export function setCloudDevOverride<K extends keyof CloudSettings>(
  key: K,
  value: CloudSettings[K],
): void {
  if (!import.meta.env.DEV) return;
  devOverrides[key] = value;
}

export function resetCloudDevOverrides(): void {
  devOverrides = {};
}
