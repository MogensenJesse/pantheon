// src/map/authoring/gridBrush.ts — bounded disc stamp over height/biome grids

import type { MapGrids } from '../MapGrids';
import { discGridLayout } from './gridDirtyRegion';

export interface GridDiscStampOptions {
  /** Brush radius in world units */
  radius: number;
  worldSize: number;
}

/**
 * Iterates grid cells inside a disc centered at world (x, z).
 * `rCells` is derived from radius; loop bounds are the disc AABB only.
 */
export function forEachCellInDisc(
  grids: MapGrids,
  x: number,
  z: number,
  opts: GridDiscStampOptions,
  fn: (i: number, j: number, idx: number, falloff: number) => void,
): void {
  const { iCenter, jCenter, rCells, bounds } = discGridLayout(
    x,
    z,
    opts.radius,
    opts.worldSize,
    grids.size,
  );
  const r2 = rCells * rCells;
  const { iMin, iMax, jMin, jMax } = bounds;

  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const di = i - iCenter;
      const dj = j - jCenter;
      const d2 = di * di + dj * dj;
      if (d2 > r2) continue;
      const falloff = rCells > 0 ? 1 - Math.sqrt(d2) / rCells : 1;
      fn(i, j, j * grids.size + i, falloff);
    }
  }
}
