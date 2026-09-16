// src/world/grass/tsl/grassFrustumVisibilityTsl.ts — sphere vs camera frustum
import { float } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/**
 * TEMP: frustum always passes. Real plane extract still fails after r186
 * (angle-dependent player square). Annulus rings still bound placement.
 */
export function grassSphereInFrustum(center: TslNode, radius: TslNode): TslNode {
  void center;
  void radius;
  return float(1);
}

export function grassFrustumVisibility(
  worldPos: TslNode,
  boundsRadius: TslNode | null = null,
): TslNode {
  const uniforms = grassSharedUniforms as any;
  const radius = boundsRadius ?? uniforms.uBladeBoundsRadius;
  return grassSphereInFrustum(worldPos, radius);
}