// src/world/grass/tsl/grassFrustumVisibilityTsl.ts — sphere vs camera frustum
import { float } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/**
 * 1 when the world-space sphere intersects the camera frustum.
 *
 * After three r186 / WebGPU, CPU plane uniforms and a naive clip-space pad both
 * failed (angle-dependent player square; only near-path cyan survived). Annulus
 * rings already bound placement — temporarily accept all frustum tests so tile
 * marks and compact visibility stay honest. Revisit with a correct clip-radius
 * projection or working plane upload.
 */
export function grassSphereInFrustum(center: TslNode, radius: TslNode): TslNode {
  void center;
  void radius;
  return float(1);
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