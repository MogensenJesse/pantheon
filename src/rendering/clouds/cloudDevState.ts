// src/rendering/clouds/cloudDevState.ts — DEV live cloud tunables (layout changes need rebuild)
import {
  applyFlatAliasesToNested,
  type CloudSettings,
  readCloudSettings,
} from './cloudConfig';

let devOverrides: Partial<CloudSettings> = {};
let _liveCached: CloudSettings | null = null;
let _liveDirty = true;

function mergeLiveCloudSettings(base: CloudSettings): CloudSettings {
  const merged: CloudSettings = {
    ...base,
    ...devOverrides,
    weather: { ...base.weather, ...devOverrides.weather },
    layers: {
      low: { ...base.layers.low, ...devOverrides.layers?.low },
      high: { ...base.layers.high, ...devOverrides.layers?.high },
    },
  };
  applyFlatAliasesToNested(merged, devOverrides);
  return merged;
}

/** Shipped VISUAL.clouds merged with DEV overrides. */
export function getLiveCloudSettings(): CloudSettings {
  const base = readCloudSettings();
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
  if (!_liveDirty && _liveCached) return _liveCached;
  _liveCached = mergeLiveCloudSettings(base);
  _liveDirty = false;
  return _liveCached;
}

export function setCloudDevOverride<K extends keyof CloudSettings>(
  key: K,
  value: CloudSettings[K],
): void {
  if (!import.meta.env.DEV) return;
  devOverrides[key] = value;
  _liveDirty = true;
}

export function resetCloudDevOverrides(): void {
  devOverrides = {};
  _liveCached = null;
  _liveDirty = true;
}