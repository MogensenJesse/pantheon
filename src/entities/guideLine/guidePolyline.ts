// src/entities/guideLine/guidePolyline.ts — path-bound walk, Catmull-Rom smooth, height drape
import type { GuideLineSettings } from '../../config/visual/guideLine';
import type { GridCell, PathGraph } from './pathGraph';

interface Xz {
  x: number;
  z: number;
}

export interface GuideSample {
  x: number;
  y: number;
  z: number;
  along: number;
}

const CATMULL_ALPHA = 0.5;

function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function cellsToXz(graph: PathGraph, cells: GridCell[]): Xz[] {
  const out: Xz[] = [];
  let lastI = Number.NaN;
  let lastJ = Number.NaN;
  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c]!;
    if (cell.i === lastI && cell.j === lastJ) continue;
    lastI = cell.i;
    lastJ = cell.j;
    out.push(graph.cellToWorld(cell.i, cell.j));
  }
  return out;
}

function lerpXz(a: Xz, b: Xz, t: number): Xz {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Drop collinear grid samples so the spline spends its curvature on real corners. */
function simplifyCollinear(points: Xz[]): Xz[] {
  if (points.length < 3) return points.slice();
  const out: Xz[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const bcx = c.x - b.x;
    const bcz = c.z - b.z;
    const cross = abx * bcz - abz * bcx;
    const mag = Math.hypot(abx, abz) * Math.hypot(bcx, bcz);
    if (mag < 1e-8) continue;
    const colinear = Math.abs(cross) < 0.08 * mag && abx * bcx + abz * bcz > 0;
    if (!colinear) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function knotAt(ti: number, a: Xz, b: Xz): number {
  return ti + distSq(a.x, a.z, b.x, b.z) ** (CATMULL_ALPHA * 0.5);
}

function lerpKnot(a: Xz, b: Xz, ta: number, tb: number, t: number): Xz {
  const span = tb - ta;
  if (Math.abs(span) < 1e-8) return a;
  const u = (t - ta) / span;
  return lerpXz(a, b, u);
}

/** Centripetal Catmull-Rom (no cusps/loops on sharp grid corners). */
function catmullRom(p0: Xz, p1: Xz, p2: Xz, p3: Xz, u: number): Xz {
  const t0 = 0;
  const t1 = knotAt(t0, p0, p1);
  const t2 = knotAt(t1, p1, p2);
  const t3 = knotAt(t2, p2, p3);
  const t = t1 + (t2 - t1) * Math.max(0, Math.min(1, u));
  const a1 = lerpKnot(p0, p1, t0, t1, t);
  const a2 = lerpKnot(p1, p2, t1, t2, t);
  const a3 = lerpKnot(p2, p3, t2, t3, t);
  const b1 = lerpKnot(a1, a2, t0, t2, t);
  const b2 = lerpKnot(a2, a3, t1, t3, t);
  return lerpKnot(b1, b2, t1, t2, t);
}

function resampleByLength(points: Xz[], count: number): Xz[] {
  if (points.length < 2 || count < 2) return points.slice();
  const segLen: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
    segLen.push(total);
  }
  if (total < 1e-4) return [points[0]!, points[points.length - 1]!];

  const out: Xz[] = [];
  let seg = 0;
  for (let s = 0; s < count; s++) {
    const target = (s / (count - 1)) * total;
    while (seg < segLen.length - 2 && segLen[seg + 1]! < target) seg += 1;
    const a = points[seg]!;
    const b = points[Math.min(points.length - 1, seg + 1)]!;
    const d0 = segLen[seg]!;
    const d1 = segLen[seg + 1]!;
    const span = Math.max(1e-6, d1 - d0);
    const t = Math.max(0, Math.min(1, (target - d0) / span));
    out.push(lerpXz(a, b, t));
  }
  out[0] = points[0]!;
  out[out.length - 1] = points[points.length - 1]!;
  return out;
}

function smoothSpline(controls: Xz[], sampleCount: number): Xz[] {
  if (controls.length < 2) return controls.slice();
  if (controls.length === 2) return resampleByLength(controls, sampleCount);

  const dense: Xz[] = [];
  const segs = controls.length - 1;
  const stepsPerSeg = Math.max(12, Math.ceil((sampleCount * 2) / segs));
  for (let i = 0; i < segs; i++) {
    const p0 = controls[Math.max(0, i - 1)]!;
    const p1 = controls[i]!;
    const p2 = controls[i + 1]!;
    const p3 = controls[Math.min(controls.length - 1, i + 2)]!;
    for (let s = 0; s < stepsPerSeg; s++) {
      dense.push(catmullRom(p0, p1, p2, p3, s / stepsPerSeg));
    }
  }
  dense.push(controls[controls.length - 1]!);
  return resampleByLength(dense, sampleCount);
}

function routeCells(
  graph: PathGraph,
  enter: GridCell,
  leave: GridCell,
  landCost: number,
): GridCell[] | null {
  graph.rebuildFlow(leave.i, leave.j);
  const alongPath = graph.walkFlow(enter.i, enter.j);
  if (alongPath && alongPath.length > 0) return alongPath;
  return graph.weightedAStar(enter.i, enter.j, leave.i, leave.j, landCost);
}

export function resolveGuideCellRoute(
  graph: PathGraph,
  playerX: number,
  playerZ: number,
  orbX: number,
  orbZ: number,
  landCost: number,
): GridCell[] | null {
  const enter = graph.nearestPathCell(playerX, playerZ);
  const leave = graph.nearestPathCell(orbX, orbZ);
  if (!enter || !leave) return null;
  return routeCells(graph, enter, leave, landCost);
}

export function drapeGuidePolyline(opts: {
  graph: PathGraph;
  cells: GridCell[];
  orbX: number;
  orbY: number;
  orbZ: number;
  getWorldY: (x: number, z: number) => number;
  settings: GuideLineSettings;
}): GuideSample[] | null {
  const { graph, settings, cells } = opts;
  if (cells.length === 0) return null;

  const orbXz: Xz = { x: opts.orbX, z: opts.orbZ };
  let xz = cellsToXz(graph, cells);
  if (xz.length === 0) return null;

  const last = xz[xz.length - 1]!;
  const snapMSq = settings.onPathSnapM * settings.onPathSnapM;
  const orbOff = distSq(opts.orbX, opts.orbZ, last.x, last.z) > snapMSq;
  if (orbOff) xz = [...xz, orbXz];

  xz = simplifyCollinear(xz);
  xz = smoothSpline(xz, settings.sampleCount);
  if (xz.length < 2) return null;

  const lastIdx = xz.length - 1;
  const points: GuideSample[] = [];
  let along = 0;
  for (let i = 0; i < xz.length; i++) {
    const p = xz[i]!;
    if (i > 0) {
      const prev = xz[i - 1]!;
      along += Math.hypot(p.x - prev.x, p.z - prev.z);
    }
    const t = lastIdx <= 0 ? 0 : i / lastIdx;
    let y = opts.getWorldY(p.x, p.z) + settings.lift;
    if (orbOff && t > 0.82) {
      const arcT = (t - 0.82) / 0.18;
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * arcT);
      y = y * (1 - ease) + opts.orbY * ease + Math.sin(Math.PI * ease) * settings.arcHeight;
    }
    points.push({ x: p.x, y, z: p.z, along });
  }

  return points;
}

export function closestPointOnGuide(
  points: GuideSample[],
  x: number,
  z: number,
): GuideSample | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0]!;

  let best = points[0]!;
  let bestD = distSq(x, z, best.x, best.z);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const span = abx * abx + abz * abz;
    const t =
      span < 1e-10 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / span));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = distSq(x, z, px, pz);
    if (d < bestD) {
      bestD = d;
      best = {
        x: px,
        y: a.y + (b.y - a.y) * t,
        z: pz,
        along: a.along + (b.along - a.along) * t,
      };
    }
  }
  return best;
}
