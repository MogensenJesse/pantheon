// src/core/energy.ts — centralized energy mutations
import { bus } from './EventBus';
import { state } from './GameState';
import { PHASE0 } from '../config/phase0';
import { WORLD } from '../world/WorldConfig';

export function setEnergy(value: number): void {
  state.energy = Math.min(state.energyCap, Math.max(0, value));
  bus.emit('energy:changed', { energy: state.energy, cap: state.energyCap });
}

export function addEnergy(delta: number): void {
  setEnergy(state.energy + delta);
}

export function discoverAllStones(): void {
  for (const stone of WORLD.LANDMARKS.stones) {
    if (!state.stonesFound.has(stone.id)) {
      state.stonesFound.add(stone.id);
      state.energy = Math.min(state.energyCap, state.energy + PHASE0.LANDMARK_ENERGY.stone);
      bus.emit('stone:touched', { stoneId: stone.id });
    }
  }
  bus.emit('energy:changed', { energy: state.energy, cap: state.energyCap });
}
