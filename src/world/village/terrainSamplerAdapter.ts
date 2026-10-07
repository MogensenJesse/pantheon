// src/world/village/terrainSamplerAdapter.ts — adapts the play terrain to the village sim's sampler interface
import { Vector3 } from 'three';
import { VILLAGE } from '../../config/village';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { sampleChiseledWorldNormal } from '../terrain/cpu/terrainChiselCpu';
import type { TerrainSampler } from './sim/terrainSampler';

export function createTerrainSampler(terrain: MapTerrainContext): TerrainSampler {
  const normal = new Vector3();
  return {
    getY: (x, z) => terrain.getWorldY(x, z),
    getNormalY: (x, z) => sampleChiseledWorldNormal(terrain.grids, x, z, normal).y,
    isWet: (x, z) => terrain.getWorldY(x, z) < terrain.waterLevelM + VILLAGE.PLAN.SHORE_MARGIN_M,
  };
}
