// src/world/JourneyPath.ts — guided route from starting ruin to the mountain border

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

/** Lateral offset from the path centreline (metres); landmarks sit closer than map props. */
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
export function sampleJourneyAt(d: number): {
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
} {
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
