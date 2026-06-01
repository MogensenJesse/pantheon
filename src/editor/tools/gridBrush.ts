// src/editor/tools/gridBrush.ts — bounded disc stamp over height/biome grids
import type { MapGrids } from '../../map/MapGrids';
import { worldToGridFrac } from '../../map/MapGrids';

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
  const { u, v } = worldToGridFrac(x, z, opts.worldSize, grids.size);
  const rCells = (opts.radius / opts.worldSize) * grids.size;
  const iCenter = Math.round(u);
  const jCenter = Math.round(v);
  const r2 = rCells * rCells;

  const iMin = Math.max(0, Math.floor(iCenter - rCells));
  const iMax = Math.min(grids.size - 1, Math.ceil(iCenter + rCells));
  const jMin = Math.max(0, Math.floor(jCenter - rCells));
  const jMax = Math.min(grids.size - 1, Math.ceil(jCenter + rCells));

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
