// src/rendering/sunSpherical.ts — sun direction matching webgpu_sky.html
import { MathUtils, Vector3 } from 'three';
import { SUN_DEFAULTS } from './skyDefaults';
import { sunDevState } from './sunDevState';
import { sunRevealState } from './WorldReveal';

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

/**
 * Composite live sun elevation: animated reveal state plus any dev-panel offset
 * from the default. Single source of truth for callers that don't have a
 * placed DirectionalLight to read back from.
 */
export function currentSunElevationDeg(): number {
  return sunRevealState.elevationDeg + (sunDevState.elevationDeg - SUN_DEFAULTS.elevationDeg);
}
