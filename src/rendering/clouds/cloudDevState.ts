// src/rendering/clouds/cloudDevState.ts — DEV live cloud tunables (layout changes need rebuild)
import { type CloudSettings, readCloudSettings } from './cloudConfig';

let devOverrides: Partial<CloudSettings> = {};
let _liveCached: CloudSettings | null = null;
let _liveDirty = true;

/** Shipped VISUAL.clouds merged with DEV overrides. */
export function getLiveCloudSettings(): CloudSettings {
  const base = readCloudSettings();
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
  if (!_liveDirty && _liveCached) return _liveCached;
  _liveCached = { ...base, ...devOverrides };
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
