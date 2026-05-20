// src/world/JourneyPath.ts — guided route from starting ruin to the mountain border
import { Vector2 } from 'three';
import type { TerrainContext } from './TerrainGenerator';

/** Max polyline segments passed to terrain shader (must match GLSL loop bound). */
export const JOURNEY_SHADER_MAX_SEGMENTS = 48;

/** S-curve path from SW ruin → NE mountains (world x, z). */
const ZIGZAG = {
  START: [-28, -40] as const,
  END: [74, -58] as const,
  /** More segments = smoother bends between waypoints. */
  SEGMENTS: 38,
  /** Peak lateral displacement from the chord (metres). */
  AMPLITUDE: 14,
  /** Full left-right cycles along the route. */
  WAVE_CYCLES: 3,
} as const;

function buildZigzagWaypoints(): ReadonlyArray<readonly [number, number]> {
  const [sx, sz] = ZIGZAG.START;
  const [ex, ez] = ZIGZAG.END;
  const dx = ex - sx;
  const dz = ez - sz;
  const chordLen = Math.hypot(dx, dz) || 1;
  const perpX = -dz / chordLen;
  const perpZ = dx / chordLen;

  const points: Array<readonly [number, number]> = [[sx, sz]];
  for (let i = 1; i <= ZIGZAG.SEGMENTS; i++) {
    const t = i / ZIGZAG.SEGMENTS;
    const baseX = sx + dx * t;
    const baseZ = sz + dz * t;
    const wave = Math.sin(t * Math.PI * 2 * ZIGZAG.WAVE_CYCLES) * ZIGZAG.AMPLITUDE;
    points.push([baseX + perpX * wave, baseZ + perpZ * wave]);
  }
  return points;
}

export const JOURNEY_WAYPOINTS = buildZigzagWaypoints();

/** Lateral offset from the path centreline (metres); landmarks sit closer than scatter props. */
export const PATH_LANDMARK_OFFSET = 2.35;

const _segLengths: number[] = [];
let _totalLength = 0;

function initPathMetrics(): void {
  if (_totalLength > 0) return;
  for (let i = 0; i < JOURNEY_WAYPOINTS.length - 1; i++) {
    const [x0, z0] = JOURNEY_WAYPOINTS[i];
    const [x1, z1] = JOURNEY_WAYPOINTS[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    _segLengths.push(len);
    _totalLength += len;
  }
}

export function getJourneyTotalLength(): number {
  initPathMetrics();
  return _totalLength;
}

/** Position and unit tangent at distance `d` along the polyline (0 … total length). */
export function sampleJourneyAt(
  d: number,
): { x: number; z: number; tangentX: number; tangentZ: number } {
  initPathMetrics();
  let dist = Math.max(0, Math.min(_totalLength, d));

  for (let i = 0; i < _segLengths.length; i++) {
    const segLen = _segLengths[i];
    if (dist > segLen) {
      dist -= segLen;
      continue;
    }
    const t = segLen > 0 ? dist / segLen : 0;
    const [x0, z0] = JOURNEY_WAYPOINTS[i];
    const [x1, z1] = JOURNEY_WAYPOINTS[i + 1];
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const tx = x1 - x0;
    const tz = z1 - z0;
    const len = Math.hypot(tx, tz) || 1;
    return { x, z, tangentX: tx / len, tangentZ: tz / len };
  }

  const last = JOURNEY_WAYPOINTS[JOURNEY_WAYPOINTS.length - 1];
  return { x: last[0], z: last[1], tangentX: 1, tangentZ: 0 };
}

/** Arc-length at a normalized position along the route (0 = start, 1 = end). */
export function alongPath(fraction: number): number {
  const t = Math.max(0, Math.min(1, fraction));
  return getJourneyTotalLength() * t;
}

/**
 * Point `lateralOffset` metres beside the path at arc-length `d`.
 * `sideSign` is +1 or -1 (left / right of travel).
 */
export function positionBesidePath(
  d: number,
  sideSign: 1 | -1,
  lateralOffset: number,
): [number, number] {
  const { x, z, tangentX, tangentZ } = sampleJourneyAt(d);
  const perpX = -tangentZ;
  const perpZ = tangentX;
  return [x + perpX * lateralOffset * sideSign, z + perpZ * lateralOffset * sideSign];
}

function distancePointToSegment(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - x0, pz - z0);
  let t = ((px - x0) * dx + (pz - z0) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx;
  const cz = z0 + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

/** Shortest distance from (x, z) to the journey polyline centreline. */
export interface JourneyPathShaderSegments {
  count: number;
  segA: Vector2[];
  segB: Vector2[];
}

/** Polyline segments for GPU distance-to-path (fixed-size arrays for WebGL1). */
export function getJourneyPathShaderSegments(): JourneyPathShaderSegments {
  initPathMetrics();
  const count = Math.min(JOURNEY_WAYPOINTS.length - 1, JOURNEY_SHADER_MAX_SEGMENTS);
  const segA: Vector2[] = [];
  const segB: Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const [x0, z0] = JOURNEY_WAYPOINTS[i];
    const [x1, z1] = JOURNEY_WAYPOINTS[i + 1];
    segA.push(new Vector2(x0, z0));
    segB.push(new Vector2(x1, z1));
  }
  while (segA.length < JOURNEY_SHADER_MAX_SEGMENTS) {
    segA.push(new Vector2());
    segB.push(new Vector2());
  }
  return { count, segA, segB };
}

/** Shortest distance from (x, z) to the journey polyline centreline. */
export function distanceToJourneyPath(x: number, z: number): number {
  initPathMetrics();
  let minDist = Infinity;
  for (let i = 0; i < JOURNEY_WAYPOINTS.length - 1; i++) {
    const [x0, z0] = JOURNEY_WAYPOINTS[i];
    const [x1, z1] = JOURNEY_WAYPOINTS[i + 1];
    minDist = Math.min(minDist, distancePointToSegment(x, z, x0, z0, x1, z1));
  }
  return minDist;
}

export function isOnJourneyPath(x: number, z: number, exclusionRadius: number): boolean {
  return distanceToJourneyPath(x, z) < exclusionRadius;
}

/** Random point within `halfWidth` metres of the journey polyline (may overlap the trail). */
export function sampleNearJourney(
  rng: () => number,
  halfWidth: number,
): { x: number; z: number } {
  initPathMetrics();
  const d = rng() * _totalLength;
  const { x, z, tangentX, tangentZ } = sampleJourneyAt(d);
  const perpX = -tangentZ;
  const perpZ = tangentX;
  const offset = (rng() - 0.5) * 2 * halfWidth;
  return { x: x + perpX * offset, z: z + perpZ * offset };
}

/**
 * Random point beside the path, between `innerRadius` (trail edge) and `outerRadius`
 * (corridor edge). Never places on the painted trail.
 */
export function sampleBesideJourney(
  rng: () => number,
  innerRadius: number,
  outerRadius: number,
): { x: number; z: number } {
  initPathMetrics();
  const d = rng() * _totalLength;
  const { x, z, tangentX, tangentZ } = sampleJourneyAt(d);
  const perpX = -tangentZ;
  const perpZ = tangentX;
  const side = rng() < 0.5 ? -1 : 1;
  const dist = innerRadius + rng() * Math.max(0.5, outerRadius - innerRadius);
  return { x: x + perpX * dist * side, z: z + perpZ * dist * side };
}

export interface PathPlacement {
  x: number;
  z: number;
}

/** Evenly spaced orb slots along the path with small lateral jitter. */
export function buildJourneyOrbPlacements(
  count: number,
  rng: () => number,
  terrain: TerrainContext,
  halfWidth: number,
): PathPlacement[] {
  initPathMetrics();
  const placements: PathPlacement[] = [];
  const margin = 6;
  const usable = Math.max(1, _totalLength - margin * 2);

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 30 && !placed; attempt++) {
      const along = margin + (i / Math.max(1, count - 1)) * usable + (rng() - 0.5) * 4;
      const { x, z, tangentX, tangentZ } = sampleJourneyAt(along);
      const perpX = -tangentZ;
      const perpZ = tangentX;
      const jitter = (rng() - 0.5) * 2 * halfWidth * 0.65;
      const px = x + perpX * jitter;
      const pz = z + perpZ * jitter;
      if (terrain.getHeightAt(px, pz) >= 0.08) {
        placements.push({ x: px, z: pz });
        placed = true;
      }
    }
    if (!placed) {
      const fallback = sampleNearJourney(rng, halfWidth);
      placements.push(fallback);
    }
  }

  return placements;
}
