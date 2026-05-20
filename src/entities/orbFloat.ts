// src/entities/orbFloat.ts — hover height above terrain with smooth bob
import { PHASE0 } from '../config/phase0';

const { GROUND_CLEARANCE, BOB_AMPLITUDE, BOB_SPEED } = PHASE0.ORB;

/** Stable hover center (no bob) — use for camera / logic that should not bounce. */
export function orbHoverBaseY(terrainY: number, orbRadius: number): number {
  return terrainY + orbRadius + GROUND_CLEARANCE;
}

/** World Y for an orb center: base hover + sine bob (phase in radians). */
export function orbCenterY(terrainY: number, orbRadius: number, elapsed: number, phase = 0): number {
  return orbHoverBaseY(terrainY, orbRadius) + BOB_AMPLITUDE * Math.sin(elapsed * BOB_SPEED + phase);
}
