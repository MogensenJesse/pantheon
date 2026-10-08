// src/world/village/sim/walkGrid.ts — what is walkable on the site grid: terrain, buildings, regions and walking effort
import { VILLAGE } from '../../../config/village.ts';
import { MinHeap } from '../../../core/math/minHeap.ts';
import { cellIndex, forEachFootprintCell, type SiteGrid } from './siteGrid.ts';

/** The eight neighbours of a cell: four straight, then four diagonal. */
export const DX = [1, -1, 0, 0, 1, 1, -1, -1];
export const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
export const SQRT2 = Math.SQRT2;
const SNAP_RADIUS_CELLS = 6;

export interface WalkGrid {
  /** 0 = impassable terrain, otherwise the cost of crossing the cell. */
  readonly terrainCost: Float32Array;
  /** Terrain is walkable and no building or field blocks the cell. */
  walkableCell: (cell: number) => boolean;
  centerX: (cell: number) => number;
  centerZ: (cell: number) => number;
  /** The cell containing (x, z) if walkable, else the nearest walkable cell within a few cells. */
  nearestWalkable: (x: number, z: number) => number;
  /** Whether every cell along a straight line is walkable. */
  lineClear: (ax: number, az: number, bx: number, bz: number) => boolean;
  /** Block a rotated rectangle plus `marginM`. */
  blockRect: (
    x: number,
    z: number,
    rotY: number,
    halfW: number,
    halfD: number,
    marginM: number,
  ) => void;
  isWalkable: (x: number, z: number) => boolean;
  isTerrainWalkable: (x: number, z: number) => boolean;
  /** Region id of a cell (connected walkable terrain, buildings ignored); -1 for unwalkable terrain. */
  regionAt: (cell: number) => number;
  /** Region id at (x, z), -1 when no walkable cell is near. */
  regionOf: (x: number, z: number) => number;
  /** Walking effort (about metres) between two points ignoring paths; Infinity when unreachable. */
  walkEffort: (fromX: number, fromZ: number, toX: number, toZ: number) => number;
}

export function createWalkGrid(grid: SiteGrid): WalkGrid {
  const { size, cellM } = grid;
  const count = size * size;
  const { STEEP_SLOPE, SLOPE_COST } = VILLAGE.PATH;

  /** 0 = impassable terrain, otherwise the cost of crossing the cell. */
  const terrainCost = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const steep = grid.slope[i]! > STEEP_SLOPE;
    terrainCost[i] = grid.water[i] || steep ? 0 : 1 + SLOPE_COST * grid.slope[i]! ** 2;
  }
  const blocked = new Uint8Array(count);

  /** Connected walkable terrain: a goal in another region can never be reached, so no search is needed. */
  const region = new Int32Array(count).fill(-1);
  {
    const stack: number[] = [];
    let regions = 0;
    for (let s = 0; s < count; s++) {
      if (terrainCost[s]! <= 0 || region[s]! >= 0) continue;
      region[s] = regions;
      stack.push(s);
      while (stack.length > 0) {
        const c = stack.pop()!;
        const ci = c % size;
        const cj = (c - ci) / size;
        for (let k = 0; k < 4; k++) {
          const ni = ci + DX[k]!;
          const nj = cj + DZ[k]!;
          if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
          const next = nj * size + ni;
          if (terrainCost[next]! <= 0 || region[next]! >= 0) continue;
          region[next] = regions;
          stack.push(next);
        }
      }
      regions++;
    }
  }
  const heap = new MinHeap();
  const walkableCell = (c: number) => c >= 0 && terrainCost[c]! > 0 && blocked[c] === 0;
  const centerX = (c: number) => grid.originX + ((c % size) + 0.5) * cellM;
  const centerZ = (c: number) => grid.originZ + (Math.floor(c / size) + 0.5) * cellM;

  /** The cell containing (x, z) if walkable, else the nearest walkable cell within a few cells. */
  const nearestWalkable = (x: number, z: number): number => {
    const own = cellIndex(grid, x, z);
    if (walkableCell(own)) return own;
    const ci = Math.floor((x - grid.originX) / cellM);
    const cj = Math.floor((z - grid.originZ) / cellM);
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let r = 1; r <= SNAP_RADIUS_CELLS && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const i = ci + dx;
          const j = cj + dz;
          if (i < 0 || j < 0 || i >= size || j >= size) continue;
          const c = j * size + i;
          if (!walkableCell(c)) continue;
          const d = (centerX(c) - x) ** 2 + (centerZ(c) - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
    }
    return best;
  };

  const lineClear = (ax: number, az: number, bx: number, bz: number): boolean => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (cellM * 0.5)));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      if (!walkableCell(cellIndex(grid, ax + (bx - ax) * t, az + (bz - az) * t))) return false;
    }
    return true;
  };

  const blockRect = (
    x: number,
    z: number,
    rotY: number,
    halfW: number,
    halfD: number,
    marginM: number,
  ) => {
    floodDirty = true;
    forEachFootprintCell(grid, x, z, rotY, halfW, halfD, marginM, (index) => {
      blocked[index] = 1;
      return true;
    });
  };

  /** Effort from `floodSource` to every cell; redone when buildings block more ground. */
  const effort = new Float32Array(count);
  const flooded = new Uint8Array(count);
  let floodSource = -1;
  let floodDirty = true;
  const flood = (source: number) => {
    effort.fill(Number.POSITIVE_INFINITY);
    flooded.fill(0);
    heap.clear();
    effort[source] = 0;
    heap.push(source, 0);
    while (heap.size > 0) {
      const cur = heap.pop();
      if (flooded[cur]) continue;
      flooded[cur] = 1;
      const ci = cur % size;
      const cj = (cur - ci) / size;
      for (let k = 0; k < 8; k++) {
        const ni = ci + DX[k]!;
        const nj = cj + DZ[k]!;
        if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
        const next = nj * size + ni;
        if (flooded[next] || !walkableCell(next)) continue;
        if (k >= 4 && (!walkableCell(cj * size + ni) || !walkableCell(nj * size + ci))) continue;
        const ng =
          effort[cur]! + (k >= 4 ? SQRT2 : 1) * (terrainCost[cur]! + terrainCost[next]!) * 0.5;
        if (ng < effort[next]!) {
          effort[next] = ng;
          heap.push(next, ng);
        }
      }
    }
    floodSource = source;
    floodDirty = false;
  };

  return {
    terrainCost,
    walkableCell,
    centerX,
    centerZ,
    nearestWalkable,
    lineClear,
    blockRect,
    isWalkable: (x, z) => walkableCell(cellIndex(grid, x, z)),
    isTerrainWalkable: (x, z) => {
      const c = cellIndex(grid, x, z);
      return c >= 0 && terrainCost[c]! > 0;
    },
    regionAt: (cell) => region[cell]!,
    regionOf: (x, z) => {
      const c = nearestWalkable(x, z);
      return c >= 0 ? region[c]! : -1;
    },
    walkEffort: (fromX, fromZ, toX, toZ) => {
      const source = nearestWalkable(fromX, fromZ);
      const target = nearestWalkable(toX, toZ);
      if (source < 0 || target < 0) return Number.POSITIVE_INFINITY;
      if (floodDirty || source !== floodSource) flood(source);
      return effort[target]! * cellM;
    },
  };
}
