// src/world/village/sim/terrainSampler.ts — terrain queries the village sim needs (injected, so sim stays pure)

export interface TerrainSampler {
  /** Walkable surface height (m). */
  getY(x: number, z: number): number;
  /** Surface normal Y component (1 = flat). */
  getNormalY(x: number, z: number): number;
  /** Water or shoreline: ground too low and wet to build or walk on. */
  isWet(x: number, z: number): boolean;
}
