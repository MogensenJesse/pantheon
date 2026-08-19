// src/entities/playerParticleDevState.ts — DEV live player-orb sparkle tunables
import type { PlayerParticleSettings } from '../config/visual/player';
import { VISUAL } from '../config/visualTuning';

let devOverrides: Partial<PlayerParticleSettings> = {};
let liveCached: PlayerParticleSettings | null = null;
let liveDirty = true;

export function getLivePlayerParticleSettings(): PlayerParticleSettings {
  const base = VISUAL.player.particles as PlayerParticleSettings;
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
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
  liveDirty = true;
}

export function resetPlayerParticleDevOverrides(): void {
  devOverrides = {};
  liveCached = null;
  liveDirty = true;
}
