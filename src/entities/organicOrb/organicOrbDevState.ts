// src/entities/organicOrb/organicOrbDevState.ts — DEV live organic-orb tunables
import type { OrganicOrbSettings } from '../../config/visual/organicOrb';
import { VISUAL } from '../../config/visualTuning';

let hasOverrides = false;
let revision = 0;
let devOverrides: Partial<OrganicOrbSettings> = {};
let liveCached: OrganicOrbSettings | null = null;
let liveDirty = true;

export function getOrganicOrbDevRevision(): number {
  return revision;
}

export function getLiveOrganicOrbSettings(): OrganicOrbSettings {
  const base = VISUAL.organicOrb as OrganicOrbSettings;
  if (!import.meta.env.DEV || !hasOverrides) return base;
  if (!liveDirty && liveCached) return liveCached;
  liveCached = { ...base, ...devOverrides };
  liveDirty = false;
  return liveCached;
}

export function setOrganicOrbDevOverride<K extends keyof OrganicOrbSettings>(
  key: K,
  value: OrganicOrbSettings[K],
): void {
  if (!import.meta.env.DEV) return;
  devOverrides[key] = value;
  hasOverrides = true;
  revision += 1;
  liveDirty = true;
}

export function resetOrganicOrbDevOverrides(): void {
  if (!import.meta.env.DEV) return;
  hasOverrides = false;
  revision += 1;
  devOverrides = {};
  liveCached = null;
  liveDirty = true;
}
