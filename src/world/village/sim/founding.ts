// src/world/village/sim/founding.ts — seating a building on its terrain
import { VILLAGE } from '../../../config/village.ts';
import type { VillageBuildingType, VillageStage } from '../assets/villageAssetKeys.ts';
import { measureFootprint, planPlinth } from './siteMeasure.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import type { Building, FootprintOf } from './villageTypes.ts';

/** Measure the footprint's relief and size the plinth so the floor is level. */
export function seatBuilding(
  sampler: TerrainSampler,
  footprintOf: FootprintOf,
  id: number,
  type: VillageBuildingType,
  stage: VillageStage,
  x: number,
  z: number,
  rotY: number,
  ring = -1,
): Building {
  const [w, d] = footprintOf(type);
  const halfW = w / 2;
  const halfD = d / 2;
  const measure = measureFootprint(sampler.getY, x, z, rotY, halfW, halfD, VILLAGE.PLINTH.PAD_M);
  const plinth = planPlinth(measure);
  return {
    id,
    type,
    x,
    z,
    rotY,
    halfW,
    halfD,
    plinthTopY: plinth.topY,
    plinthBaseY: plinth.baseY,
    stage,
    progress: 0,
    ring,
  };
}
