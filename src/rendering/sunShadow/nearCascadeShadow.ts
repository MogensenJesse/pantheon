// src/rendering/sunShadow/nearCascadeShadow.ts — dense near-follow PCSS cascade (±halfExtent)
import { DirectionalLight, type PerspectiveCamera, type Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { sunDevState } from '../sunDevState';
import { currentSunElevationDeg } from '../sunSpherical';
import { resetContactShadowSoftness } from './contactShadowUniforms';
import { syncNearCascadeHandoffFromLight } from './nearCascadeHandoffUniforms';
import { PcssShadowFilter } from './pcssShadowFilter';
import { PcssShadowNode } from './pcssShadowNode';
import { SHADOW_CAMERA_FAR_M } from './shadowFollowConstants';
import {
  createShadowFollowDirtyState,
  makeFollowSample,
  resetShadowFollowDirtyState,
  updateFollowedShadowLight,
} from './shadowFollowPose';
import { normalizeShadowMapSize } from './shadowMapSize';

let nearLight: DirectionalLight | null = null;
let nearShadowNode: PcssShadowNode | null = null;
let frustumAppliedCamera: object | null = null;
const followState = createShadowFollowDirtyState();

function ensureNearFrustum(light: DirectionalLight): void {
  const cam = light.shadow.camera;
  if (frustumAppliedCamera === cam) return;
  const half = VISUAL.shadows.lighting.near.halfExtentM;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.updateProjectionMatrix();
  frustumAppliedCamera = cam;
}

/** Shadow-only directional light (intensity 0) with a tight PCSS frustum for prop-scale density. */
export function createNearCascadeShadowLight(scene: Scene): DirectionalLight {
  if (nearLight) return nearLight;

  const lighting = VISUAL.shadows.lighting;
  const light = new DirectionalLight(0xffffff, 0);
  light.name = 'nearCascadeShadowLight';
  light.castShadow = true;
  light.shadow.autoUpdate = false;
  light.shadow.mapSize.set(lighting.near.mapSize, lighting.near.mapSize);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_CAMERA_FAR_M;
  light.shadow.bias = lighting.shadowBias;
  light.shadow.normalBias = lighting.shadowNormalBias;
  (light.shadow as { filterNode?: unknown }).filterNode = PcssShadowFilter;
  resetContactShadowSoftness();

  ensureNearFrustum(light);

  scene.add(light);
  scene.add(light.target);
  nearLight = light;
  return light;
}

export function getNearCascadeShadowLight(): DirectionalLight | null {
  return nearLight;
}

/** Singleton PCSS node for ground receivers. */
export function createNearCascadeShadowNode(): PcssShadowNode | null {
  if (!nearLight) return null;
  nearShadowNode ??= new PcssShadowNode(nearLight);
  return nearShadowNode;
}

/** Force the next bake (map-size / DEV toggles / caster visibility). */
export function invalidateNearCascadeShadowMap(): void {
  followState.needsFullRefresh = true;
}

/** DEV: resize the near map; the next shadow pass re-allocates it (and the PCSS blocker map). */
export function setNearCascadeMapSize(size: number): number {
  const light = nearLight;
  const next = normalizeShadowMapSize(size);
  if (!light || light.shadow.mapSize.x === next) return next;

  light.shadow.mapSize.set(next, next);
  light.shadow.map?.dispose();
  light.shadow.map = null;
  light.shadow.needsUpdate = true;
  invalidateNearCascadeShadowMap();
  return next;
}

/** Pose the near cascade with the sun and dirty the dense map when follow/sun need it. */
export function updateNearCascadeShadowTarget(
  x: number,
  y: number,
  z: number,
  elevationDeg = currentSunElevationDeg(),
): void {
  if (!nearLight?.castShadow) return;

  ensureNearFrustum(nearLight);
  const sample = makeFollowSample(x, y, z, elevationDeg, sunDevState.lightDistance);
  updateFollowedShadowLight(followState, nearLight, sample);

  // Handoff basis after the pose (incl. snap), every frame so the fade tracks the ortho square.
  syncNearCascadeHandoffFromLight(nearLight);
}

/** Allocate near.shadow.map early so receivers can sample on the first frames. */
export function warmupNearCascadeShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  focusX: number,
  focusY: number,
  focusZ: number,
): void {
  if (!nearLight?.castShadow || !renderer.shadowMap.enabled) return;
  invalidateNearCascadeShadowMap();
  updateNearCascadeShadowTarget(focusX, focusY, focusZ);
  nearLight.shadow.updateMatrices(nearLight);
  nearLight.shadow.needsUpdate = true;
  renderer.render(scene, camera);
}

export function disposeNearCascadeShadow(): void {
  if (!nearLight) return;
  const light = nearLight;
  nearLight = null;
  nearShadowNode = null;
  frustumAppliedCamera = null;
  resetShadowFollowDirtyState(followState);

  light.parent?.remove(light);
  light.target.parent?.remove(light.target);
  light.shadow.map?.dispose();
  light.dispose();
}
