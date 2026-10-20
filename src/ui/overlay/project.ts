// src/ui/overlay/project.ts — a world point on the screen

import { type Camera, Vector3 } from 'three';

export interface ScreenPoint {
  /** Pixels from the left and the top of the window. */
  x: number;
  y: number;
  /** Metres in front of the camera. */
  depth: number;
}

const scratch = new Vector3();

/** Puts the world point (x, y, z) on the screen in `out`; false when it is behind the camera. */
export function projectToScreen(
  camera: Camera,
  x: number,
  y: number,
  z: number,
  out: ScreenPoint,
): boolean {
  // Into view space for the depth, then on into the screen (`project` would redo the first step).
  scratch.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  out.depth = -scratch.z;
  if (out.depth <= 0.1) return false;
  scratch.applyMatrix4(camera.projectionMatrix);
  out.x = (scratch.x * 0.5 + 0.5) * window.innerWidth;
  out.y = (-scratch.y * 0.5 + 0.5) * window.innerHeight;
  return true;
}
