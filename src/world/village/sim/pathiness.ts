// src/world/village/sim/pathiness.ts — how the worn ground reads to walkers, copied into the pathfinder's cost grid
import { VILLAGE } from '../../../config/village.ts';
import { smoothstep01 } from '../../../core/math/scalar.ts';
import type { Pathfinder } from './pathfind.ts';
import type { SiteGrid } from './siteGrid.ts';
import type { WearField } from './wearField.ts';

/** How much like a path worn ground reads to walkers: 0 open ground, 1 a path. */
export function pathinessOf(worn: number): number {
  const { LO, HI } = VILLAGE.PATHS.PATHINESS;
  return smoothstep01((worn - LO) / (HI - LO));
}

/**
 * Returns a function that copies the 1 m wear into the pathfinder's 2 m cost grid (max over each
 * cell's four quarters). Which wear cells each grid cell reads never changes, so it is worked out
 * once and the copy is plain typed-array reads.
 */
export function createPathinessSync(
  grid: SiteGrid,
  wear: WearField,
  pathfinder: Pathfinder,
): () => void {
  const { size, cellM, originX, originZ } = grid;
  const q = cellM / 4;
  const offsets = [
    [-q, -q],
    [q, -q],
    [-q, q],
    [q, q],
  ] as const;
  /** Four wear-cell indices per grid cell (-1 outside the wear field). */
  const sources = new Int32Array(size * size * 4).fill(-1);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = originX + (i + 0.5) * cellM;
      const z = originZ + (j + 0.5) * cellM;
      offsets.forEach(([dx, dz], k) => {
        const wi = Math.floor((x + dx - wear.originX) / wear.cellM);
        const wj = Math.floor((z + dz - wear.originZ) / wear.cellM);
        const inside = wi >= 0 && wj >= 0 && wi < wear.size && wj < wear.size;
        sources[(j * size + i) * 4 + k] = inside ? wj * wear.size + wi : -1;
      });
    }
  }
  const pathiness = new Float32Array(size * size);
  const { LO } = VILLAGE.PATHS.PATHINESS;

  return () => {
    const { data } = wear;
    for (let cell = 0; cell < pathiness.length; cell++) {
      let worn = 0;
      for (let k = 0; k < 4; k++) {
        const index = sources[cell * 4 + k]!;
        if (index >= 0) worn = Math.max(worn, data[index]!);
      }
      pathiness[cell] = worn <= LO ? 0 : pathinessOf(worn);
    }
    pathfinder.setPathiness(pathiness);
  };
}
