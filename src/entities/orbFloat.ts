// src/entities/orbFloat.ts — hover height above terrain with smooth bob
import { PHASE0 } from '../config/phase0';

const { GROUND_CLEARANCE, BOB_AMPLITUDE, BOB_SPEED } = PHASE0.ORB;

/** Floor for near-vertical macro normals — avoids divide-by-zero, not a steep-slope cap. */
const MIN_SLOPE_NORMAL_Y = 0.08;

/** Pulse scale margin (player ±10%, energy orbs up to ~±15%). */
function pulseRadiusMargin(orbRadius: number): number {
  return orbRadius * 0.12;
}

/** Vertical lift budget: radius + gap + full bob trough + pulse swell. */
function orbClearanceBudget(orbRadius: number): number {
  return orbRadius + GROUND_CLEARANCE + BOB_AMPLITUDE + pulseRadiusMargin(orbRadius);
}

/** Stable hover center (no bob) — use for camera / logic that should not bounce. */
export function orbHoverBaseY(
  terrainY: number,
  orbRadius: number,
  surfaceNormalY = 1,
): number {
  const ny = Math.max(surfaceNormalY, MIN_SLOPE_NORMAL_Y);
  return terrainY + orbClearanceBudget(orbRadius) / ny;
}

/** World Y for an orb center: base hover + sine bob (phase in radians). */
export function orbCenterY(
  terrainY: number,
  orbRadius: number,
  elapsed: number,
  phase = 0,
  surfaceNormalY = 1,
): number {
  return (
    orbHoverBaseY(terrainY, orbRadius, surfaceNormalY) +
    BOB_AMPLITUDE * Math.sin(elapsed * BOB_SPEED + phase)
  );
}
