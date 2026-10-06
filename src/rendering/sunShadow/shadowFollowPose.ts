// src/rendering/sunShadow/shadowFollowPose.ts — follow-pose dirty state, light placement, texel snap
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { currentSunAzimuthDeg, sunDirectionFromSpherical } from '../sunSpherical';
import { computeTwistStableLightBasis } from './twistStableLightBasis';

/** Ignore only floating-point noise; visible sun motion stays continuous. */
const ANGLE_EPS_DEG = 1e-6;
const FOLLOW_POSITION_EPS_M = 1e-5;
const LIGHT_DISTANCE_EPS_M = 1e-3;

const _sunDir = new Vector3();
const _basis = { focus: new Vector3(), right: new Vector3(), up: new Vector3() };
const _snapDelta = new Vector3();

/** Per-light follow bake state (each cascade keeps its own instance). */
interface ShadowFollowDirtyState {
  lastElevationDeg: number;
  lastAzimuthDeg: number;
  lastFollowX: number;
  lastFollowY: number;
  lastFollowZ: number;
  lastLightDistance: number;
  needsFullRefresh: boolean;
}

export function createShadowFollowDirtyState(): ShadowFollowDirtyState {
  return {
    lastElevationDeg: Number.NaN,
    lastAzimuthDeg: Number.NaN,
    lastFollowX: Number.NaN,
    lastFollowY: Number.NaN,
    lastFollowZ: Number.NaN,
    lastLightDistance: Number.NaN,
    needsFullRefresh: true,
  };
}

export function resetShadowFollowDirtyState(state: ShadowFollowDirtyState): void {
  Object.assign(state, createShadowFollowDirtyState());
}

interface FollowSample {
  elevationDeg: number;
  azimuthDeg: number;
  x: number;
  /** Terrain / receiver height, not 0: the ortho square must cover the ground (HEIGHT_SCALE is 350 m). */
  y: number;
  z: number;
  lightDistance: number;
}

/** Build a follow sample from the current sun azimuth + caller elevation / focus / distance. */
export function makeFollowSample(
  x: number,
  y: number,
  z: number,
  elevationDeg: number,
  lightDistance: number,
): FollowSample {
  return { elevationDeg, azimuthDeg: currentSunAzimuthDeg(), x, y, z, lightDistance };
}

/** Pose a directional light at the sample's focus with the sample's sun direction. */
export function placeDirectionalLight(light: DirectionalLight, sample: FollowSample): void {
  sunDirectionFromSpherical(sample.elevationDeg, sample.azimuthDeg, _sunDir);
  light.target.position.set(sample.x, sample.y, sample.z);
  light.target.updateMatrixWorld();
  light.position.copy(light.target.position).addScaledVector(_sunDir, sample.lightDistance);
  light.updateMatrixWorld();
}

/** Quantize light + target onto the shadow-map texel grid in the twist-stable basis (sun direction unchanged). */
function snapLightToTexelGrid(light: DirectionalLight): void {
  const { camera, mapSize } = light.shadow;
  const texelW = (camera.right - camera.left) / Math.max(1, mapSize.x);
  const texelH = (camera.top - camera.bottom) / Math.max(1, mapSize.y);
  if (!(texelW > 0) || !(texelH > 0) || !computeTwistStableLightBasis(light, _basis)) return;

  const lightX = _basis.focus.dot(_basis.right);
  const lightY = _basis.focus.dot(_basis.up);
  const dx = Math.round(lightX / texelW) * texelW - lightX;
  const dy = Math.round(lightY / texelH) * texelH - lightY;
  if (dx === 0 && dy === 0) return;

  _snapDelta.copy(_basis.right).multiplyScalar(dx).addScaledVector(_basis.up, dy);
  light.target.position.add(_snapDelta);
  light.position.add(_snapDelta);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();
}

/**
 * Re-pose `light` for `sample` when the sun, follow point or light distance changed, and mark its
 * shadow map dirty. Returns whether it did. The texel snap runs only while the sun angle is
 * unchanged: snapping in a rotating basis thrashes soft edges.
 */
export function updateFollowedShadowLight(
  state: ShadowFollowDirtyState,
  light: DirectionalLight,
  sample: FollowSample,
): boolean {
  const angleChanged =
    Number.isNaN(state.lastElevationDeg) ||
    Math.abs(sample.elevationDeg - state.lastElevationDeg) > ANGLE_EPS_DEG ||
    Math.abs(sample.azimuthDeg - state.lastAzimuthDeg) > ANGLE_EPS_DEG;
  const followMoved =
    Number.isNaN(state.lastFollowX) ||
    Math.abs(sample.x - state.lastFollowX) > FOLLOW_POSITION_EPS_M ||
    Math.abs(sample.y - state.lastFollowY) > FOLLOW_POSITION_EPS_M ||
    Math.abs(sample.z - state.lastFollowZ) > FOLLOW_POSITION_EPS_M;
  const lightDistanceChanged =
    Number.isNaN(state.lastLightDistance) ||
    Math.abs(sample.lightDistance - state.lastLightDistance) > LIGHT_DISTANCE_EPS_M;
  if (!state.needsFullRefresh && !angleChanged && !followMoved && !lightDistanceChanged) {
    return false;
  }

  placeDirectionalLight(light, sample);
  if (!angleChanged) snapLightToTexelGrid(light);
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
  light.shadow.needsUpdate = true;

  state.lastElevationDeg = sample.elevationDeg;
  state.lastAzimuthDeg = sample.azimuthDeg;
  state.lastFollowX = sample.x;
  state.lastFollowY = sample.y;
  state.lastFollowZ = sample.z;
  state.lastLightDistance = sample.lightDistance;
  state.needsFullRefresh = false;
  return true;
}
