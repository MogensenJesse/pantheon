// src/entities/orbTerrainFooting.ts — macro surface Y + normal for slope-aware orb hover
import { Vector3 } from 'three';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import {
  sampleTerrainNormalFromHeight,
  terrainNormalSampleStepM,
} from '../world/mapProps/mapPropTerrainAlign';

const _normal = new Vector3();
const _macroSample: OrbTerrainFooting = { surfaceY: 0, normalY: 1 };
const _footingOut: OrbTerrainFooting = { surfaceY: 0, normalY: 1 };

/** Unit footprint offsets — scaled by ring radius at sample time. */
const FOOTPRINT_OFFSETS_UNIT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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
  out: OrbTerrainFooting,
): OrbTerrainFooting {
  out.surfaceY = terrain.getWorldY(x, z);
  const sampleStep = terrainNormalSampleStepM(terrain.grids.size);
  const normal = sampleTerrainNormalFromHeight(terrain.getWorldY, x, z, sampleStep, _normal);
  out.normalY = normal.y;
  return out;
}

/**
 * Max macro surface Y + steepest normal over an orb-radius footprint ring.
 * Ignores detail vertex displacement so the orb glides over micro terrain relief.
 * Writes into `out` (defaults to a shared scratch — copy fields if you need to keep the result).
 */
export function sampleOrbTerrainFooting(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'grids'>,
  x: number,
  z: number,
  orbRadius: number,
  out: OrbTerrainFooting = _footingOut,
): OrbTerrainFooting {
  const ring = orbRadius * FOOTPRINT_RING_MUL;

  let surfaceY = -Infinity;
  let normalY = 1;
  for (const [ux, uz] of FOOTPRINT_OFFSETS_UNIT) {
    const sample = sampleMacroFootingAt(terrain, x + ux * ring, z + uz * ring, _macroSample);
    if (sample.surfaceY > surfaceY) surfaceY = sample.surfaceY;
    if (sample.normalY < normalY) normalY = sample.normalY;
  }

  out.surfaceY = surfaceY;
  out.normalY = normalY;
  return out;
}
