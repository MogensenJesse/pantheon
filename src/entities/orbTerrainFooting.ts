// src/entities/orbTerrainFooting.ts — macro surface Y + normal for slope-aware orb hover
import { Vector3 } from 'three';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import {
  sampleTerrainNormalFromHeight,
  terrainNormalSampleStepM,
} from '../world/mapProps/mapPropTerrainAlign';

const _normal = new Vector3();

export interface OrbTerrainFooting {
  surfaceY: number;
  normalY: number;
}

/** Footprint ring — catches downhill macro terrain under the sphere on steep slopes. */
const FOOTPRINT_RING_MUL = 0.92;

function sampleMacroFootingAt(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'grids'>,
  x: number,
  z: number,
): OrbTerrainFooting {
  const surfaceY = terrain.getWorldY(x, z);
  const sampleStep = terrainNormalSampleStepM(terrain.grids.size);
  const normal = sampleTerrainNormalFromHeight(terrain.getWorldY, x, z, sampleStep, _normal);
  return { surfaceY, normalY: normal.y };
}

/**
 * Max macro surface Y + steepest normal over an orb-radius footprint ring.
 * Ignores detail vertex displacement so the orb glides over micro terrain relief.
 */
export function sampleOrbTerrainFooting(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'grids'>,
  x: number,
  z: number,
  orbRadius: number,
): OrbTerrainFooting {
  const ring = orbRadius * FOOTPRINT_RING_MUL;
  const offsets: readonly [number, number][] = [
    [0, 0],
    [ring, 0],
    [-ring, 0],
    [0, ring],
    [0, -ring],
  ];

  let surfaceY = -Infinity;
  let normalY = 1;
  for (const [dx, dz] of offsets) {
    const sample = sampleMacroFootingAt(terrain, x + dx, z + dz);
    if (sample.surfaceY > surfaceY) surfaceY = sample.surfaceY;
    if (sample.normalY < normalY) normalY = sample.normalY;
  }

  return { surfaceY, normalY };
}
