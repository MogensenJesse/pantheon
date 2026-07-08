// src/entities/orbFootingSmooth.ts — temporal low-pass on macro orb footing
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { type OrbTerrainFooting, sampleOrbTerrainFooting } from './orbTerrainFooting';

export interface OrbFootingSmoother {
  sample: (x: number, z: number, dt: number) => OrbTerrainFooting;
  reset: (footing: OrbTerrainFooting) => void;
}

export function createOrbFootingSmoother(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'grids'>,
  orbRadius: number,
  smoothHz: number,
): OrbFootingSmoother {
  let surfaceY = 0;
  let normalY = 1;
  let initialized = false;

  const reset = (footing: OrbTerrainFooting): void => {
    surfaceY = footing.surfaceY;
    normalY = footing.normalY;
    initialized = true;
  };

  const sample = (x: number, z: number, dt: number): OrbTerrainFooting => {
    const raw = sampleOrbTerrainFooting(terrain, x, z, orbRadius);
    if (!initialized) {
      reset(raw);
      return raw;
    }
    const t = 1 - Math.exp(-smoothHz * Math.max(dt, 0));
    surfaceY += (raw.surfaceY - surfaceY) * t;
    normalY += (raw.normalY - normalY) * t;
    return { surfaceY, normalY };
  };

  return { sample, reset };
}
