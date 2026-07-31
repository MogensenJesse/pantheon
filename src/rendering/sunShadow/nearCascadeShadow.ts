// src/rendering/sunShadow/nearCascadeShadow.ts — dense near-follow PCSS cascade (±halfExtent)
import { DirectionalLight, type PerspectiveCamera, type Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { TERRAIN_SHADOW_LAYER } from '../../world/terrain/shadow/terrainShadowCast';
import { sunDevState } from '../sunDevState';
import { currentSunElevationDeg } from '../sunSpherical';
import { configurePcssSunShadowFilter } from './configureSunShadowFilter';
import { resetContactShadowSoftness } from './contactShadowUniforms';
import { syncNearCascadeHandoffFromLight } from './nearCascadeHandoffUniforms';
import { PcssShadowNode } from './pcssShadowNode';
import {
  commitFollowDirtyState,
  createShadowFollowDirtyState,
  evaluateFollowDirty,
  makeFollowSample,
  poseDirectionalShadowFollow,
  resetShadowFollowDirtyState,
} from './shadowFollowPose';

let nearLight: DirectionalLight | null = null;
let nearShadowNode: PcssShadowNode | null = null;
let frustumAppliedCamera: object | null = null;
const followState = createShadowFollowDirtyState();

function readNearConfig() {
  return VISUAL.shadows.lighting.near;
}

function ensureNearFrustum(light: DirectionalLight): void {
  const half = readNearConfig().halfExtentM;
  const cam = light.shadow.camera;
  if (
    frustumAppliedCamera === cam &&
    cam.right === half &&
    cam.left === -half &&
    cam.top === half &&
    cam.bottom === -half
  ) {
    return;
  }
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.updateProjectionMatrix();
  frustumAppliedCamera = cam;
}

/**
 * Shadow-only directional light (intensity 0) with a tight PCSS frustum for prop-scale density.
 * Same caster layers as the main sun (default + terrain macro caster); not cloud layer.
 */
export function createNearCascadeShadowLight(
  scene: Scene,
  renderer: WebGPURenderer,
): DirectionalLight {
  if (nearLight) return nearLight;

  const near = readNearConfig();
  const lighting = VISUAL.shadows.lighting;
  const light = new DirectionalLight(0xffffff, 0);
  light.name = 'nearCascadeShadowLight';
  light.castShadow = true;
  light.shadow.autoUpdate = false;
  light.shadow.mapSize.set(near.mapSize, near.mapSize);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 900;
  light.shadow.bias = lighting.shadowBias;
  light.shadow.normalBias = lighting.shadowNormalBias;
  configurePcssSunShadowFilter(renderer, light);
  resetContactShadowSoftness(light);
  light.shadow.camera.layers.enable(TERRAIN_SHADOW_LAYER);

  ensureNearFrustum(light);

  scene.add(light);
  scene.add(light.target);
  nearLight = light;
  return light;
}

export function getNearCascadeShadowLight(): DirectionalLight | null {
  return nearLight;
}

/** Singleton PCSS node for ground receivers (min'd with cloud-cast when present). */
export function createNearCascadeShadowNode(): PcssShadowNode | null {
  if (!nearLight) return null;
  if (!nearShadowNode) {
    nearShadowNode = new PcssShadowNode(nearLight);
  }
  return nearShadowNode;
}

/** Force the next bake (map-size / DEV toggles / caster visibility). */
export function invalidateNearCascadeShadowMap(): void {
  followState.needsFullRefresh = true;
}

/**
 * Pose near cascade with the sun and dirty the dense map when follow/sun need it.
 */
export function updateNearCascadeShadowTarget(
  x: number,
  z: number,
  elevationDeg = currentSunElevationDeg(),
): void {
  if (!nearLight?.castShadow) return;

  const sample = makeFollowSample(x, z, elevationDeg, sunDevState.lightDistance);
  ensureNearFrustum(nearLight);

  const dirty = evaluateFollowDirty(followState, sample);
  if (dirty.geometryDirty) {
    poseDirectionalShadowFollow(
      nearLight,
      sample,
      !dirty.angleChanged &&
        (followState.needsFullRefresh || dirty.followMoved || dirty.lightDistanceChanged),
    );
    nearLight.shadow.needsUpdate = true;
    commitFollowDirtyState(followState, sample);
  }

  // Handoff basis after pose (includes snap). Always refresh so fade tracks the ortho square.
  syncNearCascadeHandoffFromLight(nearLight);
}

/** Allocate near.shadow.map early so receivers can sample on first frames. */
export function warmupNearCascadeShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  focusX: number,
  focusZ: number,
): void {
  if (!nearLight?.castShadow || !renderer.shadowMap.enabled) return;
  invalidateNearCascadeShadowMap();
  updateNearCascadeShadowTarget(focusX, focusZ);
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
