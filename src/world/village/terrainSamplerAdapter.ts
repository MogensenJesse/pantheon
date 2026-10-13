// src/world/village/terrainSamplerAdapter.ts — adapts the play terrain to the village sim's sampler interface
import { Vector3 } from 'three';
import { VILLAGE } from '../../config/village';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import {
  sampleChiseledWorldNormalBase,
  sampleChiseledWorldYBase,
} from '../terrain/cpu/terrainChiselCpu';
import type { TerrainSampler } from './sim/terrainSampler';

/**
 * The sim plans on the original ground: the pads it cuts into the terrain's detail layer must not
 * feed back into the layout, so the result stays a function of the map heights and the seed.
 */
export function createTerrainSampler(terrain: MapTerrainContext): TerrainSampler {
  const normal = new Vector3();
  const getY = (x: number, z: number) => sampleChiseledWorldYBase(terrain.grids, x, z);
  return {
    getY,
    getNormalY: (x, z) => sampleChiseledWorldNormalBase(terrain.grids, x, z, normal).y,
    isWet: (x, z) => getY(x, z) < terrain.waterLevelM + VILLAGE.PLAN.SHORE_MARGIN_M,
  };
}
