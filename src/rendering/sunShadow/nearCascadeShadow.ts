// src/rendering/sunShadow/nearCascadeShadow.ts — dense near-follow PCSS cascade (±halfExtent)
import { DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { TERRAIN_SHADOW_LAYER } from '../../world/terrain/shadow/terrainShadowCast';
import { sunDevState } from '../sunDevState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import { configurePcssSunShadowFilter } from './configureSunShadowFilter';
import { resetContactShadowSoftness } from './contactShadowUniforms';
import type { SunShadowNode } from './createSunShadowNode';
import { syncNearCascadeHandoffFromLight } from './nearCascadeHandoffUniforms';
import { PcssShadowNode } from './pcssShadowNode';
import {
  SUN_SHADOW_ANGLE_EPS_DEG,
  SUN_SHADOW_FOLLOW_POSITION_EPS_M,
  SUN_SHADOW_LIGHT_DISTANCE_EPS_M,
} from './shadowFollowConstants';
import { finalizeShadowLightPose } from './stabilizeLightViewShadow';

let nearLight: DirectionalLight | null = null;
let nearShadowNode: SunShadowNode | PcssShadowNode | null = null;
let frustumAppliedCamera: object | null = null;

let lastElevationDeg = Number.NaN;
let lastAzimuthDeg = Number.NaN;
let lastFollowX = Number.NaN;
let lastFollowZ = Number.NaN;
let lastLightDistance = Number.NaN;
let nearNeedsFullRefresh = true;

const _sunDir = new Vector3();

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
export function createNearCascadeShadowNode(): SunShadowNode | PcssShadowNode | null {
  if (!nearLight) return null;
  if (!nearShadowNode) {
    nearShadowNode = new PcssShadowNode(nearLight);
  }
  return nearShadowNode;
}

/** Force the next bake (map-size / DEV toggles / caster visibility). */
export function invalidateNearCascadeShadowMap(): void {
  nearNeedsFullRefresh = true;
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

  const azimuthDeg = currentSunAzimuthDeg();
  const lightDistance = sunDevState.lightDistance;

  ensureNearFrustum(nearLight);

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

  const geometryDirty = nearNeedsFullRefresh || angleChanged || followMoved || lightDistanceChanged;

  if (geometryDirty) {
    sunDirectionFromSpherical(elevationDeg, azimuthDeg, _sunDir);
    nearLight.target.position.set(x, 0, z);
    nearLight.target.updateMatrixWorld();
    nearLight.position.copy(nearLight.target.position).addScaledVector(_sunDir, lightDistance);
    nearLight.updateMatrixWorld();

    // Snap only with a stable sun basis (frozen day cycle + walk). Never while angle moves.
    finalizeShadowLightPose(
      nearLight,
      !angleChanged && (nearNeedsFullRefresh || followMoved || lightDistanceChanged),
    );
    nearLight.shadow.needsUpdate = true;

    lastElevationDeg = elevationDeg;
    lastAzimuthDeg = azimuthDeg;
    lastFollowX = x;
    lastFollowZ = z;
    lastLightDistance = lightDistance;
    nearNeedsFullRefresh = false;
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
  nearNeedsFullRefresh = true;
  lastElevationDeg = Number.NaN;
  lastAzimuthDeg = Number.NaN;
  lastFollowX = Number.NaN;
  lastFollowZ = Number.NaN;
  lastLightDistance = Number.NaN;

  light.parent?.remove(light);
  light.target.parent?.remove(light.target);
  light.shadow.map?.dispose();
  light.dispose();
}
