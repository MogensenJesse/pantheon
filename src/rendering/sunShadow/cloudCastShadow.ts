// src/rendering/sunShadow/cloudCastShadow.ts — dedicated soft cloud-cast DirectionalLight + shadow node
import { DirectionalLight, type PerspectiveCamera, type Scene } from 'three';
import { shadow } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { getLiveCloudSettings } from '../clouds/cloudDevState';
import { currentSunElevationDeg } from '../sunSpherical';
import { syncCloudCastHandoffFromLight } from './cloudCastHandoffUniforms';
import { CLOUD_SHADOW_LAYER } from './cloudCastShadowLayer';
import { CloudCastSoftShadowFilter } from './cloudCastSoftShadowFilter';
import { CLOUD_CAST_CAMERA_FAR_M, CLOUD_CAST_LIGHT_DISTANCE_M } from './shadowFollowConstants';
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
let bakeCount = 0;
/** A bake was requested and the renderer has not consumed it yet. */
let bakePending = false;

function readCastMapSize(): number {
  return VISUAL.clouds.castShadowMapSize;
}

/** Penumbra radius in cast-map texels: fixed in metres, whatever the window or map size. */
function castSoftnessTexels(): number {
  const texelM = (VISUAL.clouds.castShadowHalfM * 2) / Math.max(1, readCastMapSize());
  return VISUAL.clouds.castShadowSoftnessM / texelM;
}

function ensureCloudCastFrustum(light: DirectionalLight): void {
  const cam = light.shadow.camera;
  if (frustumAppliedCamera === cam) return;
  const half = VISUAL.clouds.castShadowHalfM;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.updateProjectionMatrix();
  frustumAppliedCamera = cam;
}

/**
 * Shadow-only directional light (intensity 0) covering a `VISUAL.clouds.castShadowHalfM` square
 * around the player, set far back along the sun ray so low-sun casters stay in front of the near
 * plane. Casters = CLOUD_SHADOW_LAYER only; soft compare filter at `castShadowSoftnessM`, not PCSS.
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
  light.shadow.camera.far = CLOUD_CAST_CAMERA_FAR_M;
  light.shadow.bias = lighting.shadowBias;
  light.shadow.normalBias = lighting.shadowNormalBias;
  light.shadow.radius = castSoftnessTexels();

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
  cloudCastLight.shadow.radius = castSoftnessTexels();
}

/**
 * Pose the cloud-cast light with the sun and bake its map every call: wind, boil and grow move
 * the casters each frame, so a still player sees the same continuous motion as a walking one.
 */
export function updateCloudCastShadowTarget(
  x: number,
  y: number,
  z: number,
  elevationDeg = currentSunElevationDeg(),
): void {
  if (!cloudCastLight) return;

  const live = getLiveCloudSettings();
  syncCloudCastShadowSettings(live.enabled && live.castShadows);

  if (!cloudCastLight.castShadow) return;

  const sample = makeFollowSample(x, y, z, elevationDeg, CLOUD_CAST_LIGHT_DISTANCE_M);
  ensureCloudCastFrustum(cloudCastLight);
  updateFollowedShadowLight(followState, cloudCastLight, sample);
  // Handoff basis after the pose (incl. texel snap) so the receiver fade tracks the ortho square.
  syncCloudCastHandoffFromLight(cloudCastLight);

  // The renderer clears needsUpdate once it has baked: that is the bake count.
  if (bakePending && !cloudCastLight.shadow.needsUpdate) bakeCount += 1;
  cloudCastLight.shadow.needsUpdate = true;
  bakePending = true;
}

/** Cloud-cast maps the renderer has baked since load (DEV: bakes/sec from deltas). */
export function getCloudCastBakeCount(): number {
  return bakeCount;
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
  bakePending = false;
  resetShadowFollowDirtyState(followState);

  light.parent?.remove(light);
  light.target.parent?.remove(light.target);
  light.shadow.map?.dispose();
  light.dispose();
}
