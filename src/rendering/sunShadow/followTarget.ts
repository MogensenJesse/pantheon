// src/rendering/sunShadow/followTarget.ts — player-follow sun shadow frustum + map warmup
import { type DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { sunDevState } from '../sunDevState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import { snapSunShadowTargetToTexels } from './snapSunShadowTarget';

// Was 160 — widened so nearby mesh clouds stay inside the player-follow shadow map.
const SHADOW_FOLLOW_HALF = 280;

const _sunDir = new Vector3();

/**
 * Place sun using webgpu_sky.html spherical elevation/azimuth (degrees above horizon).
 */
export function updateSunShadowTarget(
  x: number,
  z: number,
  sun: DirectionalLight,
  elevationDeg = currentSunElevationDeg(),
): void {
  sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
  sun.target.position.set(x, 0, z);
  sun.position.copy(sun.target.position).addScaledVector(_sunDir, sunDevState.lightDistance);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();

  const cam = sun.shadow.camera;
  cam.left = -SHADOW_FOLLOW_HALF;
  cam.right = SHADOW_FOLLOW_HALF;
  cam.top = SHADOW_FOLLOW_HALF;
  cam.bottom = -SHADOW_FOLLOW_HALF;
  cam.updateProjectionMatrix();

  if (VISUAL.shadows.lighting.stabilizeShadowMap) {
    snapSunShadowTargetToTexels(sun);
    sun.position.copy(sun.target.position).addScaledVector(_sunDir, sunDevState.lightDistance);
    sun.updateMatrixWorld();
  }

  if (sun.castShadow) {
    // Final camera/matrix update after the snapped light and target positions are settled.
    sun.shadow.updateMatrices(sun);
    if (sun.intensity > 0) {
      sun.shadow.needsUpdate = true;
    }
  }
}

/**
 * Allocate sun.shadow.map before postFX / compileAsync so GodraysNode and shadow()
 * receivers can sample depth without TSL texture() errors on the first frames.
 */
export function warmupSunShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  sun: DirectionalLight,
  camera: PerspectiveCamera,
  focusX: number,
  focusZ: number,
): void {
  if (!sun.castShadow || !renderer.shadowMap.enabled) return;

  updateSunShadowTarget(focusX, focusZ, sun);
  renderer.render(scene, camera);
}
