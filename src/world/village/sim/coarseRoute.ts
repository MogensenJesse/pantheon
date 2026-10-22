// src/world/village/sim/coarseRoute.ts — the long way to a place far outside the village grid
// (pure and node-runnable)
//
// The village's own pathfinder works on the village-local grid. A place of power can stand hundreds of metres
// beyond it, so the route there is found once, on a coarse grid over the stretch between the two points, with
// the same rules as the walk grid (water and steep ground block, slope costs extra). The result is a short list
// of waypoints that a builder walks in chunks (`PATH.MAX_WAYPOINTS` at a time) and walks back in reverse.

import { VILLAGE } from '../../../config/village.ts';
import { MinHeap } from '../../../core/math/minHeap.ts';
import type { TerrainSampler } from './terrainSampler.ts';
import { DX, DZ, SQRT2 } from './walkGrid.ts';

const CELL_M = 8;
/** The grid reaches this far beyond the box around the two points (m), room to walk around a lake or a ridge. */
const MARGIN_M = 300;
/** The goal (and the start) may be this far from the nearest walkable ground (m). */
const SNAP_M = 24;
/** Slope is judged at the worst of five points over the cell, as the cell is larger than a step. */
const PROBES: readonly (readonly [number, number])[] = [
  [0, 0],
  [-3, -3],
  [3, -3],
  [-3, 3],
  [3, 3],
];

export interface CoarseRoute {
  /** x, z pairs from the start to the goal (both on walkable ground; the start is the first pair). */
  points: Float32Array;
  /** Where the route ends: the walkable ground nearest the place. */
  endX: number;
  endZ: number;
  /** Walking effort in metres (steep ground counts extra). */
  effortM: number;
  /** Minutes on foot at the villagers' walking speed. */
  walkMinutes: number;
}

/** Walking minutes for an effort in metres. */
export const walkMinutes = (effortM: number): number =>
  effortM / VILLAGE.VILLAGERS.WALK_SPEED_MPS / 60;

/**
 * The route on foot from (fromX, fromZ) to (toX, toZ), or null when there is none or it takes longer than
 * `limitMin` minutes.
 */
export function findCoarseRoute(
  sampler: TerrainSampler,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  limitMin: number = VILLAGE.RESTORATION.ROUTE_WALK_LIMIT_MIN,
): CoarseRoute | null {
  const { STEEP_SLOPE, SLOPE_COST } = VILLAGE.PATH;
  const minX = Math.min(fromX, toX) - MARGIN_M;
  const minZ = Math.min(fromZ, toZ) - MARGIN_M;
  const w = Math.ceil((Math.abs(fromX - toX) + 2 * MARGIN_M) / CELL_M);
  const h = Math.ceil((Math.abs(fromZ - toZ) + 2 * MARGIN_M) / CELL_M);
  const count = w * h;
  const cx = (c: number) => minX + ((c % w) + 0.5) * CELL_M;
  const cz = (c: number) => minZ + (Math.floor(c / w) + 0.5) * CELL_M;
  const cellAt = (x: number, z: number) => {
    const i = Math.floor((x - minX) / CELL_M);
    const j = Math.floor((z - minZ) / CELL_M);
    return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i;
  };

  /** 0 = impassable, otherwise the cost of crossing the cell. */
  const cost = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const x = cx(c);
    const z = cz(c);
    if (sampler.isWet(x, z)) continue;
    let worst = 0;
    for (const [ox, oz] of PROBES) {
      const ny = Math.max(1e-3, sampler.getNormalY(x + ox, z + oz));
      worst = Math.max(worst, Math.sqrt(Math.max(0, 1 - ny * ny)) / ny);
    }
    cost[c] = worst > STEEP_SLOPE ? 0 : 1 + SLOPE_COST * worst * worst;
  }

  /** The walkable cell nearest (x, z) within SNAP_M, -1 when none. */
  const snap = (x: number, z: number): number => {
    const reach = Math.ceil(SNAP_M / CELL_M);
    const home = cellAt(x, z);
    if (home < 0) return -1;
    let best = -1;
    let bestD = SNAP_M * SNAP_M + 1;
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        const i = (home % w) + di;
        const j = Math.floor(home / w) + dj;
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        const c = j * w + i;
        if (cost[c]! <= 0) continue;
        const d = (cx(c) - x) ** 2 + (cz(c) - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  };

  const start = snap(fromX, fromZ);
  const goal = snap(toX, toZ);
  if (start < 0 || goal < 0) return null;

  const limitEffort = limitMin * 60 * VILLAGE.VILLAGERS.WALK_SPEED_MPS;
  const g = new Float32Array(count).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(count).fill(-1);
  const done = new Uint8Array(count);
  const heap = new MinHeap();
  // Straight-line distance in cells (the cheapest a cell can cost is 1): an admissible estimate.
  const gi = goal % w;
  const gj = Math.floor(goal / w);
  const h0 = (c: number) => {
    const dx = Math.abs((c % w) - gi);
    const dz = Math.abs(Math.floor(c / w) - gj);
    return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
  };
  g[start] = 0;
  heap.push(start, h0(start));
  while (heap.size > 0) {
    const cur = heap.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goal) break;
    if (g[cur]! * CELL_M > limitEffort) break;
    const ci = cur % w;
    const cj = Math.floor(cur / w);
    for (let k = 0; k < 8; k++) {
      const ni = ci + DX[k]!;
      const nj = cj + DZ[k]!;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const next = nj * w + ni;
      if (done[next] || cost[next]! <= 0) continue;
      if (k >= 4 && (cost[cj * w + ni]! <= 0 || cost[nj * w + ci]! <= 0)) continue;
      const ng = g[cur]! + (k >= 4 ? SQRT2 : 1) * (cost[cur]! + cost[next]!) * 0.5;
      if (ng < g[next]!) {
        g[next] = ng;
        parent[next] = cur;
        heap.push(next, ng + h0(next));
      }
    }
  }
  if (!done[goal]) return null;
  const effortM = g[goal]! * CELL_M;
  if (effortM > limitEffort) return null;

  const cells: number[] = [];
  for (let c = goal; c !== -1; c = parent[c]!) cells.push(c);
  cells.reverse();

  /** Whether every cell along a straight line is walkable. */
  const lineClear = (ax: number, az: number, bx: number, bz: number): boolean => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL_M * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const c = cellAt(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
      if (c < 0 || cost[c]! <= 0) return false;
    }
    return true;
  };

  // Start from the real start, walk the cell centres, end on the goal cell's centre; then drop every waypoint
  // that a straight clear line can skip.
  const pts: number[] = [fromX, fromZ];
  for (let i = 1; i < cells.length; i++) pts.push(cx(cells[i]!), cz(cells[i]!));
  const last = pts.length / 2 - 1;
  const out: number[] = [pts[0]!, pts[1]!];
  let anchor = 0;
  while (anchor < last) {
    let next = anchor + 1;
    for (let j = last; j > anchor + 1; j--) {
      if (lineClear(pts[anchor * 2]!, pts[anchor * 2 + 1]!, pts[j * 2]!, pts[j * 2 + 1]!)) {
        next = j;
        break;
      }
    }
    out.push(pts[next * 2]!, pts[next * 2 + 1]!);
    anchor = next;
  }
  return {
    points: Float32Array.from(out),
    endX: cx(goal),
    endZ: cz(goal),
    effortM,
    walkMinutes: walkMinutes(effortM),
  };
}

/**
 * The route from the point where it leaves a disc of radius `radiusM` around (cx, cz): the first point is where it
 * crosses the circle, the rest are the route's points beyond it. A route that never leaves the disc is cut down
 * to its last point. The village's own paths carry people to the first point; the route takes them on from there.
 */
export function routeFromGate(
  points: ArrayLike<number>,
  cx: number,
  cz: number,
  radiusM: number,
): number[] {
  const n = points.length / 2;
  const dist = (k: number) => Math.hypot(points[k * 2]! - cx, points[k * 2 + 1]! - cz);
  let k = 1;
  while (k < n && dist(k) <= radiusM) k++;
  if (k >= n) return [points[(n - 1) * 2]!, points[(n - 1) * 2 + 1]!];
  // Where the segment from point k - 1 to point k crosses the circle.
  const ax = points[(k - 1) * 2]! - cx;
  const az = points[(k - 1) * 2 + 1]! - cz;
  const dx = points[k * 2]! - cx - ax;
  const dz = points[k * 2 + 1]! - cz - az;
  const a = dx * dx + dz * dz;
  const b = 2 * (ax * dx + az * dz);
  const c = ax * ax + az * az - radiusM * radiusM;
  const t =
    a > 0
      ? Math.min(1, Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)))
      : 1;
  const out = [cx + ax + dx * t, cz + az + dz * t];
  for (let j = k; j < n; j++) out.push(points[j * 2]!, points[j * 2 + 1]!);
  return out;
}
