// src/rendering/sunShadow/followTarget.ts — player-follow sun shadow frustum + map warmup
import { type DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { sunDevState } from '../sunDevState';
import { currentSunElevationDeg, sunDirectionFromSpherical } from '../sunSpherical';
import { SUN_SHADOW_FAR_FOLLOW_HALF_M } from './shadowFollowConstants';
import {
  commitFollowDirtyState,
  createShadowFollowDirtyState,
  evaluateFollowDirty,
  makeFollowSample,
  poseDirectionalShadowFollow,
} from './shadowFollowPose';

// Distant terrain/prop umbras (mesh clouds use CLOUD_SHADOW_LAYER + a separate cast light).
const SHADOW_FOLLOW_HALF = SUN_SHADOW_FAR_FOLLOW_HALF_M;

const _sunDir = new Vector3();
const followState = createShadowFollowDirtyState();

/** Ortho frustum is constant — apply once per shadow camera (not every follow-target update). */
let _frustumAppliedCamera: object | null = null;

function ensureSunShadowFrustum(sun: DirectionalLight): void {
  const cam = sun.shadow.camera;
  if (_frustumAppliedCamera === cam) return;
  cam.left = -SHADOW_FOLLOW_HALF;
  cam.right = SHADOW_FOLLOW_HALF;
  cam.top = SHADOW_FOLLOW_HALF;
  cam.bottom = -SHADOW_FOLLOW_HALF;
  cam.updateProjectionMatrix();
  _frustumAppliedCamera = cam;
}

/** Force the next bake (map-size / cloud rebuild / DEV toggles). */
export function invalidateSunShadowMap(): void {
  followState.needsFullRefresh = true;
}

/**
 * Place sun for lighting + main coverage shadows (godrays / cloud receive).
 *
 * Continuous sun direction + continuous follow. Light-view texel snap runs only when the
 * follow point / light distance changes (or a full refresh) — not on sun-angle-only frames,
 * where snapping in a rotating basis causes penumbra thrash.
 *
 * Ground receive: near PCSS inside the follow ring, far coverage outside
 * (see {@link createReceiverSunShadowNode} / {@link updateNearCascadeShadowTarget}).
 * Cloud casters use a dedicated soft map — see {@link updateCloudCastShadowTarget}.
 */
export function updateSunShadowTarget(
  x: number,
  z: number,
  sun: DirectionalLight,
  elevationDeg = currentSunElevationDeg(),
): void {
  const sample = makeFollowSample(x, z, elevationDeg, sunDevState.lightDistance);

  ensureSunShadowFrustum(sun);

  if (!sun.castShadow) {
    // Lighting-only pose (no shadow bake).
    sunDirectionFromSpherical(sample.elevationDeg, sample.azimuthDeg, _sunDir);
    sun.target.position.set(sample.x, 0, sample.z);
    sun.target.updateMatrixWorld();
    sun.position.copy(sun.target.position).addScaledVector(_sunDir, sample.lightDistance);
    sun.updateMatrixWorld();
    return;
  }

  if (sun.intensity <= 0) {
    followState.needsFullRefresh = true;
    return;
  }

  const dirty = evaluateFollowDirty(followState, sample);
  if (!dirty.geometryDirty) {
    // Pose locked — main map has no cloud casters; skip bake until sun/follow moves.
    return;
  }

  poseDirectionalShadowFollow(
    sun,
    sample,
    !dirty.angleChanged &&
      (followState.needsFullRefresh || dirty.followMoved || dirty.lightDistanceChanged),
  );
  sun.shadow.needsUpdate = true;
  commitFollowDirtyState(followState, sample);
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

  invalidateSunShadowMap();
  updateSunShadowTarget(focusX, focusZ, sun);
  sun.shadow.updateMatrices(sun);
  sun.shadow.needsUpdate = true;
  renderer.render(scene, camera);
}
