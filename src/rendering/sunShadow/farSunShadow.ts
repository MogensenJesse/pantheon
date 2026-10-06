// src/rendering/sunShadow/farSunShadow.ts — far (±200 m) player-follow sun shadow map, its node + warmup
import type { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import { shadow } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { sunDevState } from '../sunDevState';
import { currentSunElevationDeg } from '../sunSpherical';
import { SUN_SHADOW_FAR_FOLLOW_HALF_M } from './shadowFollowConstants';
import {
  createShadowFollowDirtyState,
  makeFollowSample,
  placeDirectionalLight,
  updateFollowedShadowLight,
} from './shadowFollowPose';

const followState = createShadowFollowDirtyState();

/** The ortho frustum is constant: apply it once per shadow camera, not on every follow update. */
let frustumAppliedCamera: object | null = null;

function ensureFarFrustum(sun: DirectionalLight): void {
  const cam = sun.shadow.camera;
  if (frustumAppliedCamera === cam) return;
  cam.left = -SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.right = SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.top = SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.bottom = -SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.updateProjectionMatrix();
  frustumAppliedCamera = cam;
}

let farNode: ReturnType<typeof shadow> | null = null;
let farNodeSun: DirectionalLight | null = null;

/** Shared `shadow(sun)` node for the far map: ground beyond the near ring, and clouds. */
export function createFarSunShadowNode(sun: DirectionalLight): ReturnType<typeof shadow> {
  if (!farNode || farNodeSun !== sun) {
    farNode = shadow(sun);
    farNodeSun = sun;
  }
  return farNode;
}

/** Force the next bake (map-size / DEV toggles). */
export function invalidateFarSunShadowMap(): void {
  followState.needsFullRefresh = true;
}

/**
 * Place the sun for lighting + far shadows. Sun direction and follow are continuous; the texel
 * snap only runs while the sun angle is unchanged (see {@link updateFollowedShadowLight}).
 */
export function updateFarSunShadowTarget(
  x: number,
  y: number,
  z: number,
  sun: DirectionalLight,
  elevationDeg = currentSunElevationDeg(),
): void {
  const sample = makeFollowSample(x, y, z, elevationDeg, sunDevState.lightDistance);
  ensureFarFrustum(sun);

  if (!sun.castShadow) {
    placeDirectionalLight(sun, sample); // lighting-only pose, no bake
    return;
  }
  if (sun.intensity <= 0) {
    followState.needsFullRefresh = true;
    return;
  }
  updateFollowedShadowLight(followState, sun, sample);
}

/**
 * Allocate sun.shadow.map before postFX / compileAsync so `shadow()` receivers can sample depth
 * without TSL texture() errors on the first frames.
 */
export function warmupFarSunShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
  focusX: number,
  focusY: number,
  focusZ: number,
): void {
  if (!sun.castShadow || !renderer.shadowMap.enabled) return;

  invalidateFarSunShadowMap();
  updateFarSunShadowTarget(focusX, focusY, focusZ, sun);
  sun.shadow.updateMatrices(sun);
  sun.shadow.needsUpdate = true;
  renderer.render(scene, camera);
}
