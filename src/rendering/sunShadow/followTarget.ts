// src/rendering/sunShadow/followTarget.ts — player-follow sun shadow frustum + map warmup
import { type DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { getLiveCloudSettings } from '../clouds/cloudDevState';
import { sunDevState } from '../sunDevState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import { snapSunShadowTargetToTexels } from './snapSunShadowTarget';

// Was 160 — widened so nearby mesh clouds stay inside the player-follow shadow map.
const SHADOW_FOLLOW_HALF = 280;

/** Sun angle change (°) that dirties the shadow map. */
const SUN_ANGLE_EPS_DEG = 0.02;
/** Light-distance change (m) that dirties the shadow map (DEV scrub). */
const LIGHT_DISTANCE_EPS_M = 1e-3;
/**
 * While clouds cast shadows and nothing else moved, refresh the map every N frames.
 * Clouds drift continuously; full per-frame refresh is wasted bandwidth.
 */
const CLOUD_SHADOW_REFRESH_FRAMES = 2;

const _sunDir = new Vector3();

/** Ortho frustum is constant — apply once per shadow camera (not every follow-target update). */
let _frustumAppliedCamera: object | null = null;

let lastSnappedTargetX = Number.NaN;
let lastSnappedTargetZ = Number.NaN;
let lastElevationDeg = Number.NaN;
let lastAzimuthDeg = Number.NaN;
let lastLightDistance = Number.NaN;
/** Frames since last cloud-only shadow refresh. */
let cloudShadowFrameCounter = 0;
/** Force a shadow pass after night→day, warmup, or map-size resize side effects. */
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

/** Force the next `updateSunShadowTarget` to re-render the shadow map. */
export function invalidateSunShadowMap(): void {
  shadowMapNeedsFullRefresh = true;
}

/**
 * Place sun using webgpu_sky.html spherical elevation/azimuth (degrees above horizon).
 * With `shadow.autoUpdate = false`, dirties `needsUpdate` only when the snapped follow
 * target, sun angle, or cloud-cast cadence requires a new map.
 */
export function updateSunShadowTarget(
  x: number,
  z: number,
  sun: DirectionalLight,
  elevationDeg = currentSunElevationDeg(),
): void {
  const azimuthDeg = currentSunAzimuthDeg();
  const lightDistance = sunDevState.lightDistance;

  sunDirectionFromSpherical(elevationDeg, azimuthDeg, _sunDir);
  sun.target.position.set(x, 0, z);
  sun.position.copy(sun.target.position).addScaledVector(_sunDir, lightDistance);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();

  ensureSunShadowFrustum(sun);

  if (VISUAL.shadows.lighting.stabilizeShadowMap) {
    snapSunShadowTargetToTexels(sun);
    sun.position.copy(sun.target.position).addScaledVector(_sunDir, lightDistance);
    sun.updateMatrixWorld();
  }

  if (!sun.castShadow) return;

  // Final camera/matrix update after the snapped light and target positions are settled.
  sun.shadow.updateMatrices(sun);

  if (sun.intensity <= 0) {
    // Night — skip the shadow pass; force a full refresh when the sun returns.
    shadowMapNeedsFullRefresh = true;
    return;
  }

  const tx = sun.target.position.x;
  const tz = sun.target.position.z;
  const targetMoved =
    Number.isNaN(lastSnappedTargetX) || tx !== lastSnappedTargetX || tz !== lastSnappedTargetZ;
  const sunMoved =
    Number.isNaN(lastElevationDeg) ||
    Math.abs(elevationDeg - lastElevationDeg) > SUN_ANGLE_EPS_DEG ||
    Math.abs(azimuthDeg - lastAzimuthDeg) > SUN_ANGLE_EPS_DEG;
  const lightMoved =
    Number.isNaN(lastLightDistance) ||
    Math.abs(lightDistance - lastLightDistance) > LIGHT_DISTANCE_EPS_M;

  const geometryDirty = shadowMapNeedsFullRefresh || targetMoved || sunMoved || lightMoved;

  let cloudRefreshDue = false;
  if (!geometryDirty && getLiveCloudSettings().castShadows) {
    cloudShadowFrameCounter += 1;
    if (cloudShadowFrameCounter >= CLOUD_SHADOW_REFRESH_FRAMES) {
      cloudShadowFrameCounter = 0;
      cloudRefreshDue = true;
    }
  } else if (geometryDirty) {
    cloudShadowFrameCounter = 0;
  }

  if (!geometryDirty && !cloudRefreshDue) return;

  sun.shadow.needsUpdate = true;
  shadowMapNeedsFullRefresh = false;
  lastSnappedTargetX = tx;
  lastSnappedTargetZ = tz;
  lastElevationDeg = elevationDeg;
  lastAzimuthDeg = azimuthDeg;
  lastLightDistance = lightDistance;
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
  // Intensity is often still 0 at bootstrap (pre-reveal) — force the map allocate/fill
  // now that autoUpdate is false.
  sun.shadow.needsUpdate = true;
  renderer.render(scene, camera);
}
