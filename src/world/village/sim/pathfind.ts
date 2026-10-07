// src/world/village/sim/pathfind.ts — A* on the village site grid: walkable terrain, building footprints, worn paths
import { VILLAGE } from '../../../config/village.ts';
import type { Building } from '../model/types.ts';
import { cellIndex, forEachFootprintCell, type SiteGrid } from './siteGrid.ts';

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

const SQRT2 = Math.SQRT2;
const WALL_MARGIN_M = 0.4;
const SNAP_RADIUS_CELLS = 6;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

/** Binary min-heap of cell indices keyed by f-score; stale entries are skipped on pop. */
class MinHeap {
  private nodes = new Int32Array(1024);
  private keys = new Float32Array(1024);
  size = 0;

  push(node: number, key: number): void {
    if (this.size === this.nodes.length) this.grow();
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.nodes[i] = this.nodes[parent]!;
      this.keys[i] = this.keys[parent]!;
      i = parent;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
  }

  pop(): number {
    const top = this.nodes[0]!;
    const lastNode = this.nodes[--this.size]!;
    const lastKey = this.keys[this.size]!;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1]! < this.keys[child]!) child++;
      if (this.keys[child]! >= lastKey) break;
      this.nodes[i] = this.nodes[child]!;
      this.keys[i] = this.keys[child]!;
      i = child;
    }
    this.nodes[i] = lastNode;
    this.keys[i] = lastKey;
    return top;
  }

  clear(): void {
    this.size = 0;
  }

  private grow(): void {
    const nodes = new Int32Array(this.nodes.length * 2);
    const keys = new Float32Array(this.keys.length * 2);
    nodes.set(this.nodes);
    keys.set(this.keys);
    this.nodes = nodes;
    this.keys = keys;
  }
}

export function createPathfinder(grid: SiteGrid): Pathfinder {
  const { size, cellM } = grid;
  const count = size * size;
  const { STEEP_SLOPE, SLOPE_COST, MAX_EXPANSIONS } = VILLAGE.PATH;

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

  const walkableCell = (c: number) => c >= 0 && terrainCost[c]! > 0 && blocked[c] === 0;
  const cellCost = (c: number) => terrainCost[c]! * (pathiness ? 1 - affinity * pathiness[c]! : 1);
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

  const search = (start: number, goal: number): boolean => {
    generation++;
    heap.clear();
    const gi = goal % size;
    const gj = Math.floor(goal / size);
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
      floodDirty = true;
      blockRect(b.x, b.z, b.rotY, b.halfW, b.halfD, VILLAGE.PLINTH.PAD_M + WALL_MARGIN_M);
    },
    blockRect: (x, z, rotY, halfW, halfD, marginM) => {
      floodDirty = true;
      blockRect(x, z, rotY, halfW, halfD, marginM);
    },
    walkEffort: (fromX, fromZ, toX, toZ) => {
      const source = nearestWalkable(fromX, fromZ);
      const target = nearestWalkable(toX, toZ);
      if (source < 0 || target < 0) return Number.POSITIVE_INFINITY;
      if (floodDirty || source !== floodSource) flood(source);
      return effort[target]! * cellM;
    },
    isWalkable: (x, z) => walkableCell(cellIndex(grid, x, z)),
    isTerrainWalkable: (x, z) => {
      const c = cellIndex(grid, x, z);
      return c >= 0 && terrainCost[c]! > 0;
    },
    regionOf: (x, z) => {
      const c = nearestWalkable(x, z);
      return c >= 0 ? region[c]! : -1;
    },
    setPathiness: (next) => {
      pathiness = next;
    },
    pathinessAt: (x, z) => {
      const c = cellIndex(grid, x, z);
      return pathiness && c >= 0 ? pathiness[c]! : 0;
    },
    find: (sx, sz, gx, gz, out, offset, maxWaypoints, journeyAffinity) => {
      stats.requests++;
      affinity = journeyAffinity ?? VILLAGE.PATHS.AFFINITY.FOLLOWER;
      const t0 = performance.now();
      const start = nearestWalkable(sx, sz);
      const goal = nearestWalkable(gx, gz);
      const ok = start >= 0 && goal >= 0 && region[start] === region[goal] && search(start, goal);
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
