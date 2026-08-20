// src/entities/guideLine/guideLineDevState.ts — DEV live guide-line tunables

import type { GuideLineSettings } from '../../config/visual/guideLine';
import { VISUAL } from '../../config/visualTuning';

let hasOverrides = false;
let revision = 0;
let devOverrides: Partial<GuideLineSettings> = {};
let liveCached: GuideLineSettings | null = null;
let liveDirty = true;

export function getGuideLineDevRevision(): number {
  return revision;
}

export function getLiveGuideLineSettings(): GuideLineSettings {
  const base = VISUAL.guideLine as GuideLineSettings;
  if (!import.meta.env.DEV || !hasOverrides) return base;
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
  hasOverrides = true;
  revision += 1;
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
  hasOverrides = Object.keys(devOverrides).length > 0;
  revision += 1;
  liveCached = null;
  liveDirty = true;
}

export function resetGuideLineDevOverrides(): void {
  if (!import.meta.env.DEV) return;
  hasOverrides = false;
  revision += 1;
  devOverrides = {};
  liveCached = null;
  liveDirty = true;
}
