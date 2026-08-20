// src/entities/EnergyOrb.ts — stable re-exports (gameplay instance + orb system)
export type { EnergyOrb, OrbPlacement } from './energyOrb/energyOrb';
export { countVisibleOrbs } from './energyOrb/energyOrb';
export type { InitOrbSystemOptions, OrbSystemContext } from './energyOrb/orbSystem';
export { initOrbSystem } from './energyOrb/orbSystem';
