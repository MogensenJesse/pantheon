// src/world/grass/tsl/grassFrustumVisibilityTsl.ts — sphere vs camera frustum
import { float } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/**
 * TEMP r186: plane extract still angle-dependent (player square) after WebGPU
 * named-plane sync. Keep is healthy; annulus still bounds placement. Bypass
 * until a correct clip-space or plane upload lands.
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