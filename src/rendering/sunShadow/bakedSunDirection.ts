// src/rendering/sunShadow/bakedSunDirection.ts — sun dir locked to the shadow map bake
import type { DirectionalLight, Vector3 } from 'three';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';

/**
 * Direction of the DirectionalLight that owns the shadow map.
 * Must match `updateSunShadowTarget` / shadow.matrix — not continuous `sunRevealState`
 * (using reveal angles for N·L while shadows use a frozen map looks like edge swimming).
 */
export function copyBakedSunDirection(sun: DirectionalLight, out: Vector3): Vector3 {
  out.subVectors(sun.position, sun.target.position);
  if (out.lengthSq() > 1e-8) return out.normalize();
  return sunDirectionFromSpherical(currentSunElevationDeg(), currentSunAzimuthDeg(), out);
}
