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
  const _raw: OrbTerrainFooting = { surfaceY: 0, normalY: 1 };
  const _smoothed: OrbTerrainFooting = { surfaceY: 0, normalY: 1 };

  const reset = (footing: OrbTerrainFooting): void => {
    surfaceY = footing.surfaceY;
    normalY = footing.normalY;
    initialized = true;
  };

  const sample = (x: number, z: number, dt: number): OrbTerrainFooting => {
    const raw = sampleOrbTerrainFooting(terrain, x, z, orbRadius, _raw);
    if (!initialized) {
      reset(raw);
      _smoothed.surfaceY = surfaceY;
      _smoothed.normalY = normalY;
      return _smoothed;
    }
    const t = 1 - Math.exp(-smoothHz * Math.max(dt, 0));
    surfaceY += (raw.surfaceY - surfaceY) * t;
    normalY += (raw.normalY - normalY) * t;
    _smoothed.surfaceY = surfaceY;
    _smoothed.normalY = normalY;
    return _smoothed;
  };

  return { sample, reset };
}
