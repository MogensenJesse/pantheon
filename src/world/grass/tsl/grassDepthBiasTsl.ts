// src/world/grass/tsl/grassDepthBiasTsl.ts — pull blade/flower roots toward the camera along the view ray
import { cameraPosition, EPSILON, length, min } from 'three/tsl';
import type { TslNode } from './tslNode';

/**
 * Offset that moves a root toward the camera along its own view ray. The root keeps its screen
 * position (only depth changes), so grazing view angles no longer bury blade bases in sloped
 * terrain. Capped at half the camera distance so a root never passes the camera.
 */
export function grassViewRayPull(rootWorld: TslNode, pullM: TslNode): TslNode {
  const toCamera = cameraPosition.sub(rootWorld);
  const distance = length(toCamera).max(EPSILON);
  return toCamera.div(distance).mul(min(pullM, distance.mul(0.5)));
}
