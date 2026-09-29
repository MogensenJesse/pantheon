// src/rendering/clouds/cloudDevState.ts — DEV live cloud tunables (layout changes need rebuild)
import { type CloudSettings, readCloudSettings } from './cloudConfig';

let devOverrides: Partial<CloudSettings> = {};
let lifeDebugView = false;

function mergeLiveCloudSettings(base: CloudSettings): CloudSettings {
  const merged: CloudSettings = {
    ...base,
    ...devOverrides,
    coverageNoise: { ...base.coverageNoise, ...devOverrides.coverageNoise },
    layer: { ...base.layer, ...devOverrides.layer },
  };
  const particles = Math.max(1, Math.round(merged.particles));
  merged.layer.particlesMin = particles;
  merged.layer.particlesMax = particles;
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
  lifeDebugView = false;
}

/** Editor and play debug: draw the fade multiplier instead of hiding clouds. */
export function getCloudLifeDebug(): boolean {
  return import.meta.env.DEV && lifeDebugView;
}

export function setCloudLifeDebug(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  lifeDebugView = enabled;
}
