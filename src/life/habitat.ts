// src/life/habitat.ts — where the trees are, as a coarse grid (pure: node-runnable)
//
// Leaves blow where there are trees and fireflies gather in the woods and by the shore, so the systems that give
// the world life ask this grid how wooded a place is. It is counted once, from the tree placements, in cells of
// `CELL_M`; a lookup averages the cell and its eight neighbours so the answer is smooth.

import { life } from '../config/visual/life.ts';

const H = life.HABITAT;

/** One tree as the map places it. */
export interface PlacedTree {
  key: string;
  x: number;
  z: number;
}

export interface TreeGrid {
  /** How wooded a place is, 0..1 (a share of a full cell, averaged over its neighbours). */
  density: (x: number, z: number) => number;
  /** The share of the trees around a place that are birches, 0..1 (0 where there are no trees). */
  birchShare: (x: number, z: number) => number;
}

export const isBirchKey = (key: string): boolean => key.startsWith('birch_');

const cellOf = (v: number, cellM: number) => Math.floor(v / cellM);
const keyOf = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

export function createTreeGrid(
  trees: readonly PlacedTree[],
  cellM: number = H.CELL_M,
  fullPerCell: number = H.FULL_TREES_PER_CELL,
): TreeGrid {
  const all = new Map<number, number>();
  const birches = new Map<number, number>();
  for (const tree of trees) {
    const k = keyOf(cellOf(tree.x, cellM), cellOf(tree.z, cellM));
    all.set(k, (all.get(k) ?? 0) + 1);
    if (isBirchKey(tree.key)) birches.set(k, (birches.get(k) ?? 0) + 1);
  }

  const around = (map: Map<number, number>, x: number, z: number): number => {
    const cx = cellOf(x, cellM);
    const cz = cellOf(z, cellM);
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) sum += map.get(keyOf(cx + dx, cz + dz)) ?? 0;
    }
    return sum;
  };

  return {
    density: (x, z) => Math.min(1, around(all, x, z) / (9 * fullPerCell)),
    birchShare: (x, z) => {
      const n = around(all, x, z);
      return n > 0 ? around(birches, x, z) / n : 0;
    },
  };
}

/** The middle of each wood: a cell with at least `minTrees` trees, at the mean place of its trees. */
export function woodCentres(
  trees: readonly PlacedTree[],
  cellM: number = H.CELL_M,
  minTrees: number = H.WOOD_TREES,
): { x: number; z: number }[] {
  const cells = new Map<number, { n: number; x: number; z: number }>();
  for (const tree of trees) {
    const k = keyOf(cellOf(tree.x, cellM), cellOf(tree.z, cellM));
    const cell = cells.get(k) ?? { n: 0, x: 0, z: 0 };
    cell.n++;
    cell.x += tree.x;
    cell.z += tree.z;
    cells.set(k, cell);
  }
  const out: { x: number; z: number }[] = [];
  for (const cell of cells.values()) {
    if (cell.n >= minTrees) out.push({ x: cell.x / cell.n, z: cell.z / cell.n });
  }
  return out;
}
