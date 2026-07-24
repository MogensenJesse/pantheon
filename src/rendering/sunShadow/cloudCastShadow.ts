// src/rendering/sunShadow/cloudCastShadow.ts — dedicated soft cloud-cast DirectionalLight + shadow node
import { DirectionalLight, PCFShadowMap, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { shadow } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { getLiveCloudSettings } from '../clouds/cloudDevState';
import { sunDevState } from '../sunDevState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import { CLOUD_SHADOW_LAYER } from './cloudCastShadowLayer';
import { CloudCastSoftShadowFilter } from './cloudCastSoftShadowFilter';
import { snapSunShadowTargetToWorldTexels } from './snapSunShadowTarget';

/** Match main sun follow half so cloud umbras align with the PCSS frustum. */
const CLOUD_CAST_FOLLOW_HALF = 280;
const SUN_ANGLE_EPS_DEG = 1e-6;
const FOLLOW_POSITION_EPS_M = 1e-5;
const LIGHT_DISTANCE_EPS_M = 1e-3;
/** Re-raster when only cloud particles drifted (pose locked). */
const CLOUD_CAST_REFRESH_FRAMES = 2;

type CloudCastShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof CloudCastSoftShadowFilter;
};

let cloudCastLight: DirectionalLight | null = null;
let cloudCastShadowNode: ReturnType<typeof shadow> | null = null;
let frustumAppliedCamera: object | null = null;

let lastElevationDeg = Number.NaN;
let lastAzimuthDeg = Number.NaN;
let lastFollowX = Number.NaN;
let lastFollowZ = Number.NaN;
let lastLightDistance = Number.NaN;
let cloudCastNeedsFullRefresh = true;
let cloudCastFrameCounter = 0;

const _sunDir = new Vector3();

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

/** Singleton shadow(cloudCastLight) for ground receivers + godrays. */
export function createCloudCastShadowNode(): ReturnType<typeof shadow> | null {
  if (!cloudCastLight) return null;
  if (!cloudCastShadowNode) {
    cloudCastShadowNode = shadow(cloudCastLight);
  }
  return cloudCastShadowNode;
}

export function isCloudCastShadowActive(): boolean {
  return cloudCastLight != null && cloudCastLight.castShadow;
}

/** Force next cloud-cast bake (rebuild / cast toggle / map size). */
export function invalidateCloudCastShadowMap(): void {
  cloudCastNeedsFullRefresh = true;
}

/** Sync castShadow flag + radius from live cloud settings / VISUAL. */
export function syncCloudCastShadowSettings(enabled: boolean): void {
  if (!cloudCastLight) return;
  if (cloudCastLight.castShadow !== enabled) {
    cloudCastLight.castShadow = enabled;
    cloudCastNeedsFullRefresh = true;
  }
  cloudCastLight.shadow.radius = readCastSoftness();
}

/**
 * Pose cloud-cast light with the sun and dirty the soft map when follow/sun/clouds need it.
 * Main sun map is no longer refreshed for cloud drift alone.
 */
export function updateCloudCastShadowTarget(
  x: number,
  z: number,
  elevationDeg = currentSunElevationDeg(),
): void {
  if (!cloudCastLight) return;

  const liveCast = getLiveCloudSettings().castShadows;
  syncCloudCastShadowSettings(liveCast);

  if (!cloudCastLight.castShadow) return;

  // Match main sun: no bake while sun intensity is zero (reveal / night).
  // Callers still pose via the shared sun; we skip needsUpdate when sun is down.
  const azimuthDeg = currentSunAzimuthDeg();
  const lightDistance = sunDevState.lightDistance;

  ensureCloudCastFrustum(cloudCastLight);

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

  const geometryDirty =
    cloudCastNeedsFullRefresh || angleChanged || followMoved || lightDistanceChanged;

  if (!geometryDirty) {
    cloudCastFrameCounter += 1;
    if (cloudCastFrameCounter < CLOUD_CAST_REFRESH_FRAMES) return;
    cloudCastFrameCounter = 0;
    cloudCastLight.shadow.needsUpdate = true;
    return;
  }

  cloudCastFrameCounter = 0;

  sunDirectionFromSpherical(elevationDeg, azimuthDeg, _sunDir);
  if (VISUAL.shadows.lighting.stabilizeShadowMap) {
    snapSunShadowTargetToWorldTexels(cloudCastLight, x, z);
  } else {
    cloudCastLight.target.position.set(x, 0, z);
    cloudCastLight.target.updateMatrixWorld();
  }
  cloudCastLight.position
    .copy(cloudCastLight.target.position)
    .addScaledVector(_sunDir, lightDistance);
  cloudCastLight.updateMatrixWorld();

  cloudCastLight.shadow.updateMatrices(cloudCastLight);
  cloudCastLight.shadow.needsUpdate = true;

  lastElevationDeg = elevationDeg;
  lastAzimuthDeg = azimuthDeg;
  lastFollowX = x;
  lastFollowZ = z;
  lastLightDistance = lightDistance;
  cloudCastNeedsFullRefresh = false;
}

/** Allocate cloud.shadow.map early so receivers/godrays can sample on first frames. */
export function warmupCloudCastShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  focusX: number,
  focusZ: number,
): void {
  if (!cloudCastLight?.castShadow || !renderer.shadowMap.enabled) return;
  invalidateCloudCastShadowMap();
  updateCloudCastShadowTarget(focusX, focusZ);
  cloudCastLight.shadow.updateMatrices(cloudCastLight);
  cloudCastLight.shadow.needsUpdate = true;
  renderer.render(scene, camera);
}
