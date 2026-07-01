// src/core/state/gameState.ts — gameplay state (energy, phase, fragments)

import { PHASE0 } from '../../config/phase0';

export interface GameState {
  energy: number;
  energyCap: number;
  /** Residue orbs picked up — drives cumulative world night lightness. */
  orbsAbsorbed: number;
  phase: number;
  memoryFragments: number[];
}

export function createGameState(): GameState {
  return {
    energy: 0,
    energyCap: PHASE0.ENERGY_CAP,
    orbsAbsorbed: 0,
    phase: 0,
    memoryFragments: [],
  };
}

export const state = createGameState();
