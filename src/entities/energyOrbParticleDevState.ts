// src/entities/energyOrbParticleDevState.ts — DEV live energy-orb sparkle tunables
import type { EnergyOrbParticleSettings } from '../config/visual/energyOrb';
import { VISUAL } from '../config/visualTuning';

let devOverrides: Partial<EnergyOrbParticleSettings> = {};
let liveCached: EnergyOrbParticleSettings | null = null;
let liveDirty = true;

export function getLiveEnergyOrbParticleSettings(): EnergyOrbParticleSettings {
  const base = VISUAL.energyOrb.particles as EnergyOrbParticleSettings;
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
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
  liveDirty = true;
}

export function resetEnergyOrbParticleDevOverrides(): void {
  devOverrides = {};
  liveCached = null;
  liveDirty = true;
}
