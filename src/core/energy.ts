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
