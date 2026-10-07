// src/world/village/sim/siting.ts — terrain relief under a building footprint, the plinth that levels it, and seating a building
import { VILLAGE } from '../../../config/village.ts';
import type { VillageBuildingType, VillageStage } from '../model/assetKeys.ts';
import type { Building, FootprintOf } from '../model/types.ts';
import type { TerrainSampler } from './terrainSampler.ts';

export interface FootprintMeasure {
  hMin: number;
  hMax: number;
  hMean: number;
}

export interface PlinthPlan {
  topY: number;
  baseY: number;
}

/**
 * Sample ground heights on a grid inside the rotated footprint (plus a margin). Yaw follows three:
 * local +Z turns toward world +X as rotY grows.
 */
export function measureFootprint(
  getY: (x: number, z: number) => number,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
  marginM = 0.5,
  stepM = 1,
): FootprintMeasure {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const ex = halfW + marginM;
  const ez = halfD + marginM;
  const nx = Math.max(1, Math.ceil((2 * ex) / stepM));
  const nz = Math.max(1, Math.ceil((2 * ez) / stepM));
  let hMin = Number.POSITIVE_INFINITY;
  let hMax = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let n = 0;
  for (let i = 0; i <= nx; i++) {
    const lx = -ex + (2 * ex * i) / nx;
    for (let j = 0; j <= nz; j++) {
      const lz = -ez + (2 * ez * j) / nz;
      const h = getY(x + lx * cos + lz * sin, z - lx * sin + lz * cos);
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
      sum += h;
      n++;
    }
  }
  return { hMin, hMax, hMean: sum / n };
}

export function planPlinth(measure: FootprintMeasure): PlinthPlan {
  const { TOP_LIFT_M, SINK_M, MIN_HEIGHT_M } = VILLAGE.PLINTH;
  const topY = measure.hMax + TOP_LIFT_M;
  const baseY = Math.min(measure.hMin - SINK_M, topY - MIN_HEIGHT_M);
  return { topY, baseY };
}

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
