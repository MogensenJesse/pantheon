// src/rendering/sunShadow/cloudCastShadow.ts — dedicated soft cloud-cast DirectionalLight + shadow node
import { DirectionalLight, type PerspectiveCamera, type Scene } from 'three';
import { shadow } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { getLiveCloudSettings } from '../clouds/cloudDevState';
import { cloudWindDriftMeters } from '../clouds/cloudWindInstances';
import { sunDevState } from '../sunDevState';
import { currentSunElevationDeg } from '../sunSpherical';
import { CLOUD_SHADOW_LAYER } from './cloudCastShadowLayer';
import { CloudCastSoftShadowFilter } from './cloudCastSoftShadowFilter';
import { SHADOW_CAMERA_FAR_M, SUN_SHADOW_FAR_FOLLOW_HALF_M } from './shadowFollowConstants';
import {
  createShadowFollowDirtyState,
  makeFollowSample,
  resetShadowFollowDirtyState,
  updateFollowedShadowLight,
} from './shadowFollowPose';

type CloudCastShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof CloudCastSoftShadowFilter;
};

let cloudCastLight: DirectionalLight | null = null;
let cloudCastShadowNode: ReturnType<typeof shadow> | null = null;
let frustumAppliedCamera: object | null = null;
const followState = createShadowFollowDirtyState();
let lastBakeDriftM = Number.NaN;
let lastBakeWindDirDeg = Number.NaN;

function readCastSoftness(): number {
  return VISUAL.clouds.castShadowSoftness;
}

function readCastMapSize(): number {
  return VISUAL.clouds.castShadowMapSize;
}

/** Still-pose rebake step: one texel of the cast map. A multi-texel step reads as a jump. */
function cloudCastDriftStepM(): number {
  const mapSize = Math.max(1, readCastMapSize());
  return (SUN_SHADOW_FAR_FOLLOW_HALF_M * 2) / mapSize;
}

function ensureCloudCastFrustum(light: DirectionalLight): void {
  const cam = light.shadow.camera;
  if (frustumAppliedCamera === cam) return;
  cam.left = -SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.right = SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.top = SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.bottom = -SUN_SHADOW_FAR_FOLLOW_HALF_M;
  cam.updateProjectionMatrix();
  frustumAppliedCamera = cam;
}

/**
 * Shadow-only directional light (intensity 0) covering the same ±200 m square as the far map.
 * Casters = CLOUD_SHADOW_LAYER only; soft compare filter at `VISUAL.clouds.castShadowSoftness`
 * texels, not PCSS.
 */
export function createCloudCastShadowLight(scene: Scene): DirectionalLight {
  if (cloudCastLight) return cloudCastLight;

  const lighting = VISUAL.shadows.lighting;
  const light = new DirectionalLight(0xffffff, 0);
  light.name = 'cloudCastShadowLight';
  light.castShadow = VISUAL.clouds.castShadows;
  light.shadow.autoUpdate = false;
  light.shadow.mapSize.set(readCastMapSize(), readCastMapSize());
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_CAMERA_FAR_M;
  light.shadow.bias = lighting.shadowBias;
  light.shadow.normalBias = lighting.shadowNormalBias;
  light.shadow.radius = readCastSoftness();

  (light.shadow as CloudCastShadowWithFilter).filterNode = CloudCastSoftShadowFilter;

  // Only cloud casters — disable default layer 0 so props/terrain do not write here.
  light.shadow.camera.layers.disable(0);
  light.shadow.camera.layers.enable(CLOUD_SHADOW_LAYER);

  scene.add(light);
  scene.add(light.target);
  cloudCastLight = light;
  return light;
}

export function getCloudCastShadowLight(): DirectionalLight | null {
  return cloudCastLight;
}

/** Singleton shadow(cloudCastLight) for ground receivers. */
export function createCloudCastShadowNode(): ReturnType<typeof shadow> | null {
  if (!cloudCastLight) return null;
  if (!cloudCastShadowNode) {
    cloudCastShadowNode = shadow(cloudCastLight);
  }
  return cloudCastShadowNode;
}

/** Force next cloud-cast bake (rebuild / cast toggle / map size). */
export function invalidateCloudCastShadowMap(): void {
  followState.needsFullRefresh = true;
}

/** Sync castShadow flag + radius from live cloud settings / VISUAL. */
function syncCloudCastShadowSettings(enabled: boolean): void {
  if (!cloudCastLight) return;
  if (cloudCastLight.castShadow !== enabled) {
    cloudCastLight.castShadow = enabled;
    followState.needsFullRefresh = true;
  }
  cloudCastLight.shadow.radius = readCastSoftness();
}

function noteCloudCastDrift(elapsed: number, windSpeed: number, windDirectionDeg: number): void {
  lastBakeDriftM = cloudWindDriftMeters(elapsed, windSpeed);
  lastBakeWindDirDeg = windDirectionDeg;
}

/** True when clouds have moved enough, or the wind axis changed, since the last bake. */
function cloudCastDrifted(elapsed: number, windSpeed: number, windDirectionDeg: number): boolean {
  if (!Number.isFinite(lastBakeDriftM) || windDirectionDeg !== lastBakeWindDirDeg) return true;
  const drift = cloudWindDriftMeters(elapsed, windSpeed);
  return Math.abs(drift - lastBakeDriftM) >= cloudCastDriftStepM();
}

/**
 * Pose the cloud-cast light with the sun and dirty its map when follow/sun/clouds need it.
 * `windElapsedSec` is the same clock {@link applyWindToCloudInstances} uses.
 */
export function updateCloudCastShadowTarget(
  x: number,
  y: number,
  z: number,
  elevationDeg = currentSunElevationDeg(),
  windElapsedSec = 0,
): void {
  if (!cloudCastLight) return;

  const live = getLiveCloudSettings();
  syncCloudCastShadowSettings(live.enabled && live.castShadows);

  if (!cloudCastLight.castShadow) return;

  const sample = makeFollowSample(x, y, z, elevationDeg, sunDevState.lightDistance);
  ensureCloudCastFrustum(cloudCastLight);

  if (!updateFollowedShadowLight(followState, cloudCastLight, sample)) {
    // Pose locked: re-bake only once the clouds drifted a texel or the wind axis turned.
    if (!cloudCastDrifted(windElapsedSec, live.windSpeed, live.windDirectionDeg)) return;
    cloudCastLight.shadow.needsUpdate = true;
  }
  noteCloudCastDrift(windElapsedSec, live.windSpeed, live.windDirectionDeg);
}

/** Allocate cloud.shadow.map early so receivers can sample on first frames. */
export function warmupCloudCastShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  focusX: number,
  focusY: number,
  focusZ: number,
): void {
  if (!cloudCastLight?.castShadow || !renderer.shadowMap.enabled) return;
  invalidateCloudCastShadowMap();
  updateCloudCastShadowTarget(focusX, focusY, focusZ);
  cloudCastLight.shadow.updateMatrices(cloudCastLight);
  cloudCastLight.shadow.needsUpdate = true;
  renderer.render(scene, camera);
}

export function disposeCloudCastShadow(): void {
  if (!cloudCastLight) return;
  const light = cloudCastLight;
  cloudCastLight = null;
  cloudCastShadowNode = null;
  frustumAppliedCamera = null;
  lastBakeDriftM = Number.NaN;
  lastBakeWindDirDeg = Number.NaN;
  resetShadowFollowDirtyState(followState);

  light.parent?.remove(light);
  light.target.parent?.remove(light.target);
  light.shadow.map?.dispose();
  light.dispose();
}
