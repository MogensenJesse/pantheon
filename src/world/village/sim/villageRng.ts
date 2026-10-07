// src/world/village/sim/villageRng.ts — independent seeded streams so one system never shifts another's rolls
import alea from 'alea';

export interface VillageRngs {
  /** Planner: ring model, sites, path links, building kinds. */
  plan: () => number;
  /** Agents: routines and wandering. */
  agents: () => number;
  /** Visual-only variation (never feeds back into the sim). */
  visual: () => number;
}

export function createVillageRngs(seed: number): VillageRngs {
  return {
    plan: alea(`village:${seed}:plan`),
    agents: alea(`village:${seed}:agents`),
    visual: alea(`village:${seed}:visual`),
  };
}
