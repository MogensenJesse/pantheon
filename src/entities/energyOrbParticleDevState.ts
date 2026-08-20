// src/entities/energyOrbParticleDevState.ts — DEV live energy-orb sparkle tunables
import type { EnergyOrbParticleSettings } from '../config/visual/energyOrb';
import { VISUAL } from '../config/visualTuning';

let hasOverrides = false;
let revision = 0;
let devOverrides: Partial<EnergyOrbParticleSettings> = {};
let liveCached: EnergyOrbParticleSettings | null = null;
let liveDirty = true;

export function getEnergyOrbParticleDevRevision(): number {
  return revision;
}

export function getLiveEnergyOrbParticleSettings(): EnergyOrbParticleSettings {
  const base = VISUAL.energyOrb.particles as EnergyOrbParticleSettings;
  if (!import.meta.env.DEV || !hasOverrides) return base;
  if (!liveDirty && liveCached) return liveCached;
  liveCached = { ...base, ...devOverrides };
  liveDirty = false;
  return liveCached;
}

export function setEnergyOrbParticleDevOverride<K extends keyof EnergyOrbParticleSettings>(
  key: K,
  value: EnergyOrbParticleSettings[K],
): void {
  if (!import.meta.env.DEV) return;
  devOverrides[key] = value;
  hasOverrides = true;
  revision += 1;
  liveDirty = true;
}

export function resetEnergyOrbParticleDevOverrides(): void {
  if (!import.meta.env.DEV) return;
  hasOverrides = false;
  revision += 1;
  devOverrides = {};
  liveCached = null;
  liveDirty = true;
}
