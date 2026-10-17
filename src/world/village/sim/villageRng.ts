// src/world/village/sim/villageRng.ts — independent seeded streams so one system never shifts another's rolls
import alea, { type AleaGenerator, type AleaState } from 'alea';

/** A stream's position, as a save keeps it. */
export type RngState = AleaState;

/** A seeded stream that can report where it is and be put back there. */
export type Rng = AleaGenerator;

export interface VillageRngs {
  /** Planner: ring model, sites, path links, building kinds. */
  plan: Rng;
  /** Agents: routines and wandering. */
  agents: Rng;
}

export function createVillageRngs(seed: number): VillageRngs {
  return {
    plan: alea(`village:${seed}:plan`),
    agents: alea(`village:${seed}:agents`),
  };
}
