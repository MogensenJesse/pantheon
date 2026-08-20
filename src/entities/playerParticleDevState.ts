// src/entities/playerParticleDevState.ts — DEV live player-orb sparkle tunables
import type { PlayerParticleSettings } from '../config/visual/player';
import { VISUAL } from '../config/visualTuning';

let hasOverrides = false;
let revision = 0;
let devOverrides: Partial<PlayerParticleSettings> = {};
let liveCached: PlayerParticleSettings | null = null;
let liveDirty = true;

export function getPlayerParticleDevRevision(): number {
  return revision;
}

export function getLivePlayerParticleSettings(): PlayerParticleSettings {
  const base = VISUAL.player.particles as PlayerParticleSettings;
  if (!import.meta.env.DEV || !hasOverrides) return base;
  if (!liveDirty && liveCached) return liveCached;
  liveCached = { ...base, ...devOverrides };
  liveDirty = false;
  return liveCached;
}

export function setPlayerParticleDevOverride<K extends keyof PlayerParticleSettings>(
  key: K,
  value: PlayerParticleSettings[K],
): void {
  if (!import.meta.env.DEV) return;
  devOverrides[key] = value;
  hasOverrides = true;
  revision += 1;
  liveDirty = true;
}

export function resetPlayerParticleDevOverrides(): void {
  if (!import.meta.env.DEV) return;
  hasOverrides = false;
  revision += 1;
  devOverrides = {};
  liveCached = null;
  liveDirty = true;
}
