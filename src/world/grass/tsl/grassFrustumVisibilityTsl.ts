// src/world/grass/tsl/grassFrustumVisibilityTsl.ts — sphere vs 6 frustum planes
import { float, step } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/**
 * 1 when the world-space sphere intersects the camera frustum.
 * Distance is n·p + w (Three.js Plane / Hessian form). Near-camera spheres
 * that contain the eye pass naturally — no pitch bypass.
 */
export function grassSphereInFrustum(center: TslNode, radius: TslNode): TslNode {
  const planes = grassSharedUniforms.uFrustumPlanes;
  const negRadius = radius.negate();
  let vis: TslNode = float(1);
  for (let i = 0; i < planes.length; i++) {
    const plane = planes[i] as any;
    const dist = plane.xyz.dot(center).add(plane.w);
    vis = vis.mul(step(negRadius, dist));
  }
  return vis;
}

/** Conservative visibility (0/1) for a blade at world position (terrain Y). */
export function grassFrustumVisibility(
  worldPos: TslNode,
  boundsRadius: TslNode | null = null,
): TslNode {
  const uniforms = grassSharedUniforms as any;
  const radius = boundsRadius ?? uniforms.uBladeBoundsRadius;
  return grassSphereInFrustum(worldPos, radius);
}
