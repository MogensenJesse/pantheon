// src/entities/guideLine/guideLineDevState.ts — DEV live guide-line tunables

import type { GuideLineSettings } from '../../config/visual/guideLine';
import { VISUAL } from '../../config/visualTuning';

let devOverrides: Partial<GuideLineSettings> = {};
let liveCached: GuideLineSettings | null = null;
let liveDirty = true;

export function getLiveGuideLineSettings(): GuideLineSettings {
  const base = VISUAL.guideLine as GuideLineSettings;
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
  if (!liveDirty && liveCached) return liveCached;
  liveCached = { ...base, ...devOverrides };
  liveDirty = false;
  return liveCached;
}

export function setGuideLineDevOverride<K extends keyof GuideLineSettings>(
  key: K,
  value: GuideLineSettings[K],
): void {
  if (!import.meta.env.DEV) return;
  devOverrides[key] = value;
  liveDirty = true;
}

export const GUIDE_LINE_PARTICLE_KEYS = [
  'particleIdle',
  'particleSpreadM',
  'particleSizeM',
  'particleHdr',
  'particleSpin',
] as const satisfies readonly (keyof GuideLineSettings)[];

export function resetGuideLineParticleDevOverrides(): void {
  if (!import.meta.env.DEV) return;
  for (const key of GUIDE_LINE_PARTICLE_KEYS) {
    delete devOverrides[key];
  }
  liveCached = null;
  liveDirty = true;
}

export function resetGuideLineDevOverrides(): void {
  devOverrides = {};
  liveCached = null;
  liveDirty = true;
}
