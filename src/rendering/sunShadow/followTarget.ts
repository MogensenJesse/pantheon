// src/rendering/sunShadow/followTarget.ts — player-follow sun shadow frustum + map warmup
import { type DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { sunDevState } from '../sunDevState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import {
  SUN_SHADOW_ANGLE_EPS_DEG,
  SUN_SHADOW_FAR_FOLLOW_HALF_M,
  SUN_SHADOW_FOLLOW_POSITION_EPS_M,
  SUN_SHADOW_LIGHT_DISTANCE_EPS_M,
} from './shadowFollowConstants';
import { finalizeShadowLightPose } from './stabilizeLightViewShadow';

// Distant terrain/prop umbras (mesh clouds use CLOUD_SHADOW_LAYER + a separate cast light).
const SHADOW_FOLLOW_HALF = SUN_SHADOW_FAR_FOLLOW_HALF_M;

const _sunDir = new Vector3();

/** Ortho frustum is constant — apply once per shadow camera (not every follow-target update). */
let _frustumAppliedCamera: object | null = null;

/** Continuous sun/follow values used by the most recent shadow bake. */
let lastElevationDeg = Number.NaN;
let lastAzimuthDeg = Number.NaN;
let lastFollowX = Number.NaN;
let lastFollowZ = Number.NaN;
let lastLightDistance = Number.NaN;
let shadowMapNeedsFullRefresh = true;

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
  shadowMapNeedsFullRefresh = true;
}

/**
 * Place sun for lighting + main (hard) shadows (godrays / cloud receive).
 *
 * Continuous sun direction + continuous follow. Light-view texel snap runs only when the
 * follow point / light distance changes (or a full refresh) — not on sun-angle-only frames,
 * where snapping in a rotating basis causes penumbra thrash.
 *
 * Ground receive uses the near cascade — see {@link updateNearCascadeShadowTarget}.
 * Cloud casters use a dedicated soft map — see {@link updateCloudCastShadowTarget}.
 */
export function updateSunShadowTarget(
  x: number,
  z: number,
  sun: DirectionalLight,
  elevationDeg = currentSunElevationDeg(),
): void {
  const azimuthDeg = currentSunAzimuthDeg();
  const lightDistance = sunDevState.lightDistance;

  ensureSunShadowFrustum(sun);

  if (!sun.castShadow) {
    sunDirectionFromSpherical(elevationDeg, azimuthDeg, _sunDir);
    sun.target.position.set(x, 0, z);
    sun.target.updateMatrixWorld();
    sun.position.copy(sun.target.position).addScaledVector(_sunDir, lightDistance);
    sun.updateMatrixWorld();
    return;
  }

  if (sun.intensity <= 0) {
    shadowMapNeedsFullRefresh = true;
    return;
  }

  const angleChanged =
    Number.isNaN(lastElevationDeg) ||
    Math.abs(elevationDeg - lastElevationDeg) > SUN_SHADOW_ANGLE_EPS_DEG ||
    Math.abs(azimuthDeg - lastAzimuthDeg) > SUN_SHADOW_ANGLE_EPS_DEG;
  const followMoved =
    Number.isNaN(lastFollowX) ||
    Math.abs(x - lastFollowX) > SUN_SHADOW_FOLLOW_POSITION_EPS_M ||
    Math.abs(z - lastFollowZ) > SUN_SHADOW_FOLLOW_POSITION_EPS_M;
  const lightDistanceChanged =
    Number.isNaN(lastLightDistance) ||
    Math.abs(lightDistance - lastLightDistance) > SUN_SHADOW_LIGHT_DISTANCE_EPS_M;

  const geometryDirty =
    shadowMapNeedsFullRefresh || angleChanged || followMoved || lightDistanceChanged;

  if (!geometryDirty) {
    // Pose locked — main map has no cloud casters; skip bake until sun/follow moves.
    return;
  }

  sunDirectionFromSpherical(elevationDeg, azimuthDeg, _sunDir);
  sun.target.position.set(x, 0, z);
  sun.target.updateMatrixWorld();
  sun.position.copy(sun.target.position).addScaledVector(_sunDir, lightDistance);
  sun.updateMatrixWorld();

  // Snap only with a stable sun basis (frozen day cycle + walk). Never while angle moves.
  finalizeShadowLightPose(
    sun,
    !angleChanged && (shadowMapNeedsFullRefresh || followMoved || lightDistanceChanged),
  );
  sun.shadow.needsUpdate = true;

  lastElevationDeg = elevationDeg;
  lastAzimuthDeg = azimuthDeg;
  lastFollowX = x;
  lastFollowZ = z;
  lastLightDistance = lightDistance;
  shadowMapNeedsFullRefresh = false;
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
