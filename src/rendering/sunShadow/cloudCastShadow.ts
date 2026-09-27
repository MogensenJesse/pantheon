// src/rendering/sunShadow/cloudCastShadow.ts — dedicated soft cloud-cast DirectionalLight + shadow node
import { DirectionalLight, PCFShadowMap, type PerspectiveCamera, type Scene } from 'three';
import { shadow } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { getLiveCloudSettings } from '../clouds/cloudDevState';
import { cloudWindDriftMeters } from '../clouds/cloudWindInstances';
import { sunDevState } from '../sunDevState';
import { currentSunElevationDeg } from '../sunSpherical';
import { CLOUD_SHADOW_LAYER } from './cloudCastShadowLayer';
import { CloudCastSoftShadowFilter } from './cloudCastSoftShadowFilter';
import { SUN_SHADOW_FAR_FOLLOW_HALF_M } from './shadowFollowConstants';
import {
  commitFollowDirtyState,
  createShadowFollowDirtyState,
  evaluateFollowDirty,
  makeFollowSample,
  poseDirectionalShadowFollow,
  resetShadowFollowDirtyState,
} from './shadowFollowPose';

/** Match main sun follow half so cloud umbras align with the PCSS frustum. */
const CLOUD_CAST_FOLLOW_HALF = SUN_SHADOW_FAR_FOLLOW_HALF_M;
/**
 * Re-raster when wind drift since the last bake exceeds this (m).
 * Softness 64 on the 400 m map is a ~12 m blur, so 1.5 m stays inside the penumbra.
 */
const CLOUD_CAST_DRIFT_M = 1.5;

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

function ensureCloudCastFrustum(light: DirectionalLight): void {
  const cam = light.shadow.camera;
  if (frustumAppliedCamera === cam) return;
  cam.left = -CLOUD_CAST_FOLLOW_HALF;
  cam.right = CLOUD_CAST_FOLLOW_HALF;
  cam.top = CLOUD_CAST_FOLLOW_HALF;
  cam.bottom = -CLOUD_CAST_FOLLOW_HALF;
  cam.updateProjectionMatrix();
  frustumAppliedCamera = cam;
}

/**
 * Shadow-only directional light (intensity 0). Casters = CLOUD_SHADOW_LAYER only.
 * Soft compare filter at {@link VISUAL.clouds.castShadowSoftness} texels — not PCSS.
 */
export function createCloudCastShadowLight(
  scene: Scene,
  renderer: WebGPURenderer,
): DirectionalLight {
  if (cloudCastLight) return cloudCastLight;

  const lighting = VISUAL.shadows.lighting;
  const light = new DirectionalLight(0xffffff, 0);
  light.name = 'cloudCastShadowLight';
  light.castShadow = VISUAL.clouds.castShadows;
  light.shadow.autoUpdate = false;
  light.shadow.mapSize.set(readCastMapSize(), readCastMapSize());
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 900;
  light.shadow.bias = lighting.shadowBias;
  light.shadow.normalBias = lighting.shadowNormalBias;
  light.shadow.radius = readCastSoftness();

  renderer.shadowMap.type = PCFShadowMap;
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
export function syncCloudCastShadowSettings(enabled: boolean): void {
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
  return Math.abs(drift - lastBakeDriftM) >= CLOUD_CAST_DRIFT_M;
}

/**
 * Pose cloud-cast light with the sun and dirty the soft map when follow/sun/clouds need it.
 * Main sun map is no longer refreshed for cloud drift alone.
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

  // Match main sun: no bake while sun intensity is zero (reveal / night).
  // Callers still pose via the shared sun; we skip needsUpdate when sun is down.
  const sample = makeFollowSample(x, y, z, elevationDeg, sunDevState.lightDistance);
  ensureCloudCastFrustum(cloudCastLight);

  const dirty = evaluateFollowDirty(followState, sample);
  if (!dirty.geometryDirty) {
    if (!cloudCastDrifted(windElapsedSec, live.windSpeed, live.windDirectionDeg)) return;
    noteCloudCastDrift(windElapsedSec, live.windSpeed, live.windDirectionDeg);
    cloudCastLight.shadow.needsUpdate = true;
    return;
  }

  noteCloudCastDrift(windElapsedSec, live.windSpeed, live.windDirectionDeg);
  poseDirectionalShadowFollow(
    cloudCastLight,
    sample,
    !dirty.angleChanged &&
      (followState.needsFullRefresh || dirty.followMoved || dirty.lightDistanceChanged),
  );
  cloudCastLight.shadow.needsUpdate = true;
  commitFollowDirtyState(followState, sample);
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
