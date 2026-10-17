// src/world/village/sim/pathfind.ts — A* on the village site grid: walkable terrain, building footprints, worn paths
import { VILLAGE } from '../../../config/village.ts';
import { MinHeap } from '../../../core/math/minHeap.ts';
import type { Building } from '../model/types.ts';
import { cellIndex, type SiteGrid } from './siteGrid.ts';
import { createWalkGrid, DX, DZ, SQRT2 } from './walkGrid.ts';

export interface PathfinderStats {
  requests: number;
  failures: number;
  expansions: number;
  /** Total time spent searching (ms). */
  searchMs: number;
}

export interface Pathfinder {
  stats: PathfinderStats;
  /** Footprints are not walkable (a small margin keeps people off the walls). */
  blockBuilding: (building: Building) => void;
  /** Block a rotated rectangle plus `marginM` (fields: people tend them from the edge). */
  blockRect: (
    x: number,
    z: number,
    rotY: number,
    halfW: number,
    halfD: number,
    marginM: number,
  ) => void;
  isWalkable: (x: number, z: number) => boolean;
  /** Id of the connected stretch of walkable terrain at (x, z), -1 when none is near. Buildings do not split regions. */
  regionOf: (x: number, z: number) => number;
  /** Terrain alone is walkable at (x, z) (dry and not too steep); buildings are ignored. */
  isTerrainWalkable: (x: number, z: number) => boolean;
  /**
   * Walking effort (about metres, steep ground counts extra) from one point to another, ignoring
   * paths and with no search limit; Infinity when unreachable. One flood answers many queries from
   * the same source, so it is cheap to judge many candidate sites.
   */
  walkEffort: (fromX: number, fromZ: number, toX: number, toZ: number) => number;
  /** Per-cell pathiness 0..1 on the site grid (0 open ground, 1 a path); paths are cheaper to cross. */
  setPathiness: (pathiness: Float32Array | null) => void;
  /** Pathiness at a world position (0 off the grid). */
  pathinessAt: (x: number, z: number) => number;
  /** The per-cell pathiness the searches currently read (it lags the wear by up to one sync). */
  getPathiness: () => Float32Array | null;
  /**
   * Smoothed waypoints from start to goal written into `out` from `offset` (x, z pairs). Start and
   * goal snap to the nearest walkable cell. Returns the waypoint count, 0 when there is no path.
   */
  find: (
    sx: number,
    sz: number,
    gx: number,
    gz: number,
    out: Float32Array,
    offset: number,
    maxWaypoints: number,
    /** How much cheaper path cells are for this journey; default is a path follower. */
    affinity?: number,
  ) => number;
}

const WALL_MARGIN_M = 0.4;

export function createPathfinder(grid: SiteGrid): Pathfinder {
  const { size } = grid;
  const count = size * size;
  const { MAX_EXPANSIONS } = VILLAGE.PATH;
  const walk = createWalkGrid(grid);
  const { terrainCost, walkableCell, nearestWalkable, lineClear, centerX, centerZ } = walk;

  let pathiness: Float32Array | null = null;
  /** Path discount of the search in progress. */
  let affinity: number = VILLAGE.PATHS.AFFINITY.FOLLOWER;

  const g = new Float32Array(count);
  const parent = new Int32Array(count);
  const seen = new Uint32Array(count);
  const closed = new Uint32Array(count);
  let generation = 0;
  const heap = new MinHeap();
  const stats: PathfinderStats = { requests: 0, failures: 0, expansions: 0, searchMs: 0 };

  const cellCost = (c: number) => terrainCost[c]! * (pathiness ? 1 - affinity * pathiness[c]! : 1);

  const search = (start: number, goal: number): boolean => {
    generation++;
    heap.clear();
    const gi = goal % size;
    const gj = Math.floor(goal / size);
    // Deliberately not scaled by the path discount (weighted A*): an admissible estimate was tried and
    // moved walking-on-paths by only +1/0/-1 points while the hostile stress seed hit MAX_EXPANSIONS
    // more often (skipped links 72 to 86).
    const h = (c: number) => {
      const dx = Math.abs((c % size) - gi);
      const dz = Math.abs(Math.floor(c / size) - gj);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    g[start] = 0;
    seen[start] = generation;
    parent[start] = -1;
    heap.push(start, h(start));
    let expansions = 0;
    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === generation) continue;
      closed[cur] = generation;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expansions > MAX_EXPANSIONS) break;
      const ci = cur % size;
      const cj = Math.floor(cur / size);
      for (let k = 0; k < 8; k++) {
        const ni = ci + DX[k]!;
        const nj = cj + DZ[k]!;
        if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
        const next = nj * size + ni;
        if (closed[next] === generation || !walkableCell(next)) continue;
        if (k >= 4 && (!walkableCell(cj * size + ni) || !walkableCell(nj * size + ci))) continue;
        const stepCost = (k >= 4 ? SQRT2 : 1) * (cellCost(cur) + cellCost(next)) * 0.5;
        const ng = g[cur]! + stepCost;
        if (seen[next] !== generation || ng < g[next]!) {
          seen[next] = generation;
          g[next] = ng;
          parent[next] = cur;
          heap.push(next, ng + h(next));
        }
      }
    }
    stats.expansions += expansions;
    return found;
  };

  return {
    stats,
    blockBuilding: (b) => {
      walk.blockRect(b.x, b.z, b.rotY, b.halfW, b.halfD, VILLAGE.PLINTH.PAD_M + WALL_MARGIN_M);
    },
    blockRect: walk.blockRect,
    walkEffort: walk.walkEffort,
    isWalkable: walk.isWalkable,
    isTerrainWalkable: walk.isTerrainWalkable,
    regionOf: walk.regionOf,
    setPathiness: (next) => {
      pathiness = next;
    },
    pathinessAt: (x, z) => {
      const c = cellIndex(grid, x, z);
      return pathiness && c >= 0 ? pathiness[c]! : 0;
    },
    getPathiness: () => pathiness,
    find: (sx, sz, gx, gz, out, offset, maxWaypoints, journeyAffinity) => {
      stats.requests++;
      affinity = journeyAffinity ?? VILLAGE.PATHS.AFFINITY.FOLLOWER;
      const t0 = performance.now();
      const start = nearestWalkable(sx, sz);
      const goal = nearestWalkable(gx, gz);
      const ok =
        start >= 0 &&
        goal >= 0 &&
        walk.regionAt(start) === walk.regionAt(goal) &&
        search(start, goal);
      stats.searchMs += performance.now() - t0;
      if (!ok) {
        stats.failures++;
        return 0;
      }
      const cells: number[] = [];
      for (let c = goal; c !== -1; c = parent[c]!) cells.push(c);
      cells.reverse();
      const points: number[] = [sx, sz];
      for (let i = 1; i < cells.length; i++) points.push(centerX(cells[i]!), centerZ(cells[i]!));
      const exactGoal = walkableCell(cellIndex(grid, gx, gz));
      points.push(exactGoal ? gx : centerX(goal), exactGoal ? gz : centerZ(goal));

      let written = 0;
      let anchor = 0;
      const last = points.length / 2 - 1;
      while (anchor < last && written < maxWaypoints) {
        let next = anchor + 1;
        for (let j = last; j > anchor + 1; j--) {
          if (
            lineClear(
              points[anchor * 2]!,
              points[anchor * 2 + 1]!,
              points[j * 2]!,
              points[j * 2 + 1]!,
            )
          ) {
            next = j;
            break;
          }
        }
        out[offset + written * 2] = points[next * 2]!;
        out[offset + written * 2 + 1] = points[next * 2 + 1]!;
        written++;
        anchor = next;
      }
      return written;
    },
  };
}
