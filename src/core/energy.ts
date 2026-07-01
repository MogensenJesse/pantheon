// src/core/energy.ts — centralized energy mutations

import { bus } from './EventBus';
import { state } from './GameState';

export function setEnergy(value: number): void {
  state.energy = Math.min(state.energyCap, Math.max(0, value));
  bus.emit('energy:changed', { energy: state.energy, cap: state.energyCap });
}

export function addEnergy(delta: number): void {
  setEnergy(state.energy + delta);
}

/** Normalized energy in [0, 1]; returns 0 when energyCap is 0. */
export function getEnergyRatio(): number {
  if (state.energyCap <= 0) return 0;
  return Math.min(1, Math.max(0, state.energy / state.energyCap));
}
