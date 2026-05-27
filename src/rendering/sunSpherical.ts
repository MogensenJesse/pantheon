// src/rendering/sunSpherical.ts — sun direction matching webgpu_sky.html
import { MathUtils, Vector3 } from 'three';

/** Matches three.js examples/webgpu_sky.html guiChanged(). */
export function sunDirectionFromSpherical(
  elevationDeg: number,
  azimuthDeg: number,
  out = new Vector3(),
): Vector3 {
  const phi = MathUtils.degToRad(90 - elevationDeg);
  const theta = MathUtils.degToRad(azimuthDeg);
  return out.setFromSphericalCoords(1, phi, theta);
}
