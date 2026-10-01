// src/world/grass/tsl/grassFrustumVisibilityTsl.ts — sphere vs camera frustum
import { float, length, max, step } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/**
 * Extra sphere radius per metre of distance from the player. Compact only re-runs once the
 * camera turns past `GRASS_CAMERA_MOVE_FORWARD_DOT` (~0.36° = 0.0063 rad); this keeps the
 * cull conservative for that lag at any range.
 */
export const CAMERA_LAG_RADIUS_PER_M = 0.008;
/** Flat pad covering the player→camera orbit distance (distance is measured from the player). */
const CAMERA_ORBIT_PAD_M = 0.1;

/**
 * 1 when the world-space sphere intersects the four side planes of the camera pyramid
 * (Hessian planes n·p + w, all through the eye). Near/far are skipped: depth-convention
 * differences (reversed depth, WebGPU clip) only affect those two, the annulus rings already
 * bound distance, and the side planes alone reject everything behind the camera.
 * `uGrassFrustumCullEnabled` = 0 accepts everything.
 */
export function grassSphereInFrustum(center: TslNode, radius: TslNode): TslNode {
  const u = grassSharedUniforms;
  const planes = [u.uFrustumPlane0, u.uFrustumPlane1, u.uFrustumPlane2, u.uFrustumPlane3];
  const playerDistance = length(center.sub(u.uPlayerPosition));
  const paddedRadius = radius
    .add(playerDistance.mul(CAMERA_LAG_RADIUS_PER_M))
    .add(CAMERA_ORBIT_PAD_M);
  const negRadius = paddedRadius.negate();
  let inside: TslNode = float(1);
  for (const plane of planes) {
    const dist = plane.xyz.dot(center).add(plane.w);
    inside = inside.mul(step(negRadius, dist));
  }
  const cullOff = float(1).sub(step(float(0.5), u.uGrassFrustumCullEnabled));
  return max(inside, cullOff);
}

/** Conservative visibility (0/1) for a blade at world position (terrain Y). */
export function grassFrustumVisibility(worldPos: TslNode, boundsRadius: TslNode): TslNode {
  return grassSphereInFrustum(worldPos, boundsRadius);
}
