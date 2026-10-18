// src/overview/overviewMath.ts — the maths of the village overview camera (pure: no DOM, no three,
// node-runnable). Directions are numbers: yaw 0 looks along -z, as in the roam camera.

import { PHASE0 } from '../config/phase0.ts';

const O = PHASE0.OVERVIEW;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Disc {
  x: number;
  z: number;
  radiusM: number;
}

export const smoothstep = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export const pitchRad = (): number => (O.PITCH_DEG * Math.PI) / 180;

/** Where the camera sits and what it looks at, for a focus point, a heading and a distance. */
export function orbitPose(
  focus: Vec3,
  yaw: number,
  pitch: number,
  distance: number,
): { position: Vec3; look: Vec3 } {
  const horizontal = distance * Math.cos(pitch);
  return {
    position: {
      x: focus.x + Math.sin(yaw) * horizontal,
      y: focus.y + distance * Math.sin(pitch),
      z: focus.z + Math.cos(yaw) * horizontal,
    },
    look: { x: focus.x, y: focus.y, z: focus.z },
  };
}

export const clampDistance = (distance: number): number =>
  Math.max(O.DISTANCE_MIN_M, Math.min(O.DISTANCE_MAX_M, distance));

/** Keeps the focus inside the village's disc plus the margin. */
export function clampFocus(x: number, z: number, village: Disc): { x: number; z: number } {
  const reach = village.radiusM + O.MARGIN_M;
  const dx = x - village.x;
  const dz = z - village.z;
  const d = Math.hypot(dx, dz);
  if (d <= reach) return { x, z };
  return { x: village.x + (dx / d) * reach, z: village.z + (dz / d) * reach };
}

/** How far the focus moves in `dt` for a key direction (x right, y back, as `getMovementDirection`). */
export function panStep(
  dir: { x: number; y: number },
  yaw: number,
  distance: number,
  dt: number,
): { x: number; z: number } {
  const speed = O.PAN_PER_DISTANCE * distance * dt;
  const forward = -dir.y;
  const strafe = dir.x;
  // Forward is where the camera looks over the ground; right is a quarter turn from it.
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return {
    x: (fx * forward + -fz * strafe) * speed,
    z: (fz * forward + fx * strafe) * speed,
  };
}

/**
 * The first place a ray meets a heightfield, or null. The ray starts above the ground and is walked in
 * `stepM` steps until it goes under, then narrowed down by halving.
 */
export function rayGroundHit(
  origin: Vec3,
  dir: Vec3,
  heightAt: (x: number, z: number) => number,
  maxDistance: number,
  stepM = 2,
): Vec3 | null {
  const above = (t: number) =>
    origin.y + dir.y * t - heightAt(origin.x + dir.x * t, origin.z + dir.z * t);
  if (above(0) <= 0) return null;
  let near = 0;
  let far = -1;
  for (let t = stepM; t <= maxDistance; t += stepM) {
    if (above(t) <= 0) {
      far = t;
      break;
    }
    near = t;
  }
  if (far < 0) return null;
  for (let i = 0; i < 12; i++) {
    const mid = (near + far) / 2;
    if (above(mid) <= 0) far = mid;
    else near = mid;
  }
  const t = (near + far) / 2;
  const x = origin.x + dir.x * t;
  const z = origin.z + dir.z * t;
  return { x, y: heightAt(x, z), z };
}

/** Where a ray meets the horizontal plane at height `y`, or null (parallel, or behind the ray). */
export function rayPlaneHit(origin: Vec3, dir: Vec3, y: number): Vec3 | null {
  if (Math.abs(dir.y) < 1e-6) return null;
  const t = (y - origin.y) / dir.y;
  if (t < 0) return null;
  return { x: origin.x + dir.x * t, y, z: origin.z + dir.z * t };
}

/**
 * Grabbing the ground: the point that was under the mouse when it was pressed has to stay under the
 * mouse. Returns how far the focus must move for the point now under the mouse (`now`) to be the
 * grabbed one.
 */
export const grabShift = (grabbed: Vec3, now: Vec3): { x: number; z: number } => ({
  x: grabbed.x - now.x,
  z: grabbed.z - now.z,
});

/** The overview may start: the village is converted and the orb is close to the temple. */
export function canEnterOverview(o: {
  converted: boolean;
  /** Distance (m) from the orb to the temple's centre, or null when there is no temple. */
  templeDistanceM: number | null;
  /** The temple's half footprint (m), as a circle. */
  templeRadiusM: number;
}): boolean {
  return (
    o.converted && o.templeDistanceM !== null && o.templeDistanceM <= o.templeRadiusM + O.REACH_M
  );
}
