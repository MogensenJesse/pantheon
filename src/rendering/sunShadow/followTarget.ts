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
import { snapSunShadowTargetToWorldTexels } from './snapSunShadowTarget';

// Was 160 — widened so nearby mesh clouds stay inside the player-follow shadow map.
const SHADOW_FOLLOW_HALF = 280;
/** Ignore only floating-point noise; visible sun motion remains continuous. */
const SUN_ANGLE_EPS_DEG = 1e-6;
const FOLLOW_POSITION_EPS_M = 1e-5;
const LIGHT_DISTANCE_EPS_M = 1e-3;

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
 * Place sun for lighting + shadows.
 *
 * Continuous sun direction. World-XZ texel snap keeps the follow focus fixed while standing
 * still and avoids light-view re-axis shiver while walking under a rotating sun. Light-view
 * snap is left available for fixed-light cases but is not used on the day-cycle path.
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
    Math.abs(elevationDeg - lastElevationDeg) > SUN_ANGLE_EPS_DEG ||
    Math.abs(azimuthDeg - lastAzimuthDeg) > SUN_ANGLE_EPS_DEG;
  const followMoved =
    Number.isNaN(lastFollowX) ||
    Math.abs(x - lastFollowX) > FOLLOW_POSITION_EPS_M ||
    Math.abs(z - lastFollowZ) > FOLLOW_POSITION_EPS_M;
  const lightDistanceChanged =
    Number.isNaN(lastLightDistance) ||
    Math.abs(lightDistance - lastLightDistance) > LIGHT_DISTANCE_EPS_M;

  if (!shadowMapNeedsFullRefresh && !angleChanged && !followMoved && !lightDistanceChanged) {
    return;
  }

  sunDirectionFromSpherical(elevationDeg, azimuthDeg, _sunDir);
  if (VISUAL.shadows.lighting.stabilizeShadowMap) {
    snapSunShadowTargetToWorldTexels(sun, x, z);
  } else {
    sun.target.position.set(x, 0, z);
    sun.target.updateMatrixWorld();
  }
  sun.position.copy(sun.target.position).addScaledVector(_sunDir, lightDistance);
  sun.updateMatrixWorld();

  sun.shadow.updateMatrices(sun);
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
