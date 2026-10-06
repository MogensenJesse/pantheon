// src/rendering/sunShadow/bakedSunDirection.ts — sun dir locked to the shadow map bake
import type { DirectionalLight, Vector3 } from 'three';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';

/**
 * Direction of the DirectionalLight that owns the shadow map. Must match `updateFarSunShadowTarget`
 * / shadow.matrix, not the continuous `sunRevealState` (N·L from reveal angles against a frozen
 * map reads as edge swimming).
 */
export function copyBakedSunDirection(sun: DirectionalLight, out: Vector3): Vector3 {
  out.subVectors(sun.position, sun.target.position);
  if (out.lengthSq() > 1e-8) return out.normalize();
  return sunDirectionFromSpherical(currentSunElevationDeg(), currentSunAzimuthDeg(), out);
}
