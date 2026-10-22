// src/world/village/sim/siting.ts — terrain relief under a building footprint and seating a building on its pad
import type { VillageBuildingType, VillageStage } from '../model/assetKeys.ts';
import type { Building, FootprintOf } from '../model/types.ts';
import { planPad } from './pad.ts';
import type { TerrainSampler } from './terrainSampler.ts';

export interface FootprintMeasure {
  hMin: number;
  hMax: number;
  hMean: number;
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

/** Plan the building's level pad on the original ground: its floor is the pad's mean height. */
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
  const pad = planPad(sampler.getY, x, z, rotY, halfW, halfD);
  return {
    id,
    type,
    x,
    z,
    rotY,
    halfW,
    halfD,
    plinthTopY: pad.floorY,
    plinthBaseY: pad.minY,
    stage,
    progress: 0,
    level: 1,
    upgrade: 0,
    ring,
  };
}
