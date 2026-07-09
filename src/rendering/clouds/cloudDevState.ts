// src/rendering/clouds/cloudDevState.ts — DEV live cloud tunables (layout changes need rebuild)
import { readCloudSettings, type CloudSettings } from './cloudConfig';

let devOverrides: Partial<CloudSettings> = {};

/** Shipped VISUAL.clouds merged with DEV overrides. */
export function getLiveCloudSettings(): CloudSettings {
  const base = readCloudSettings();
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
  return { ...base, ...devOverrides };
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
