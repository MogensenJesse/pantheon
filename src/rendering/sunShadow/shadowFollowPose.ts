// src/rendering/sunShadow/shadowFollowPose.ts — shared follow dirty flags + directional pose
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { currentSunAzimuthDeg, sunDirectionFromSpherical } from '../sunSpherical';
import {
  SUN_SHADOW_ANGLE_EPS_DEG,
  SUN_SHADOW_FOLLOW_POSITION_EPS_M,
  SUN_SHADOW_LIGHT_DISTANCE_EPS_M,
} from './shadowFollowConstants';
import { finalizeShadowLightPose } from './stabilizeLightViewShadow';

const _sunDir = new Vector3();

/** Per-light follow bake state (each cascade keeps its own instance). */
export interface ShadowFollowDirtyState {
  lastElevationDeg: number;
  lastAzimuthDeg: number;
  lastFollowX: number;
  lastFollowZ: number;
  lastLightDistance: number;
  needsFullRefresh: boolean;
}

export function createShadowFollowDirtyState(): ShadowFollowDirtyState {
  return {
    lastElevationDeg: Number.NaN,
    lastAzimuthDeg: Number.NaN,
    lastFollowX: Number.NaN,
    lastFollowZ: Number.NaN,
    lastLightDistance: Number.NaN,
    needsFullRefresh: true,
  };
}

export function resetShadowFollowDirtyState(state: ShadowFollowDirtyState): void {
  state.lastElevationDeg = Number.NaN;
  state.lastAzimuthDeg = Number.NaN;
  state.lastFollowX = Number.NaN;
  state.lastFollowZ = Number.NaN;
  state.lastLightDistance = Number.NaN;
  state.needsFullRefresh = true;
}

export interface FollowSample {
  elevationDeg: number;
  azimuthDeg: number;
  x: number;
  z: number;
  lightDistance: number;
}

export interface FollowDirtyFlags {
  angleChanged: boolean;
  followMoved: boolean;
  lightDistanceChanged: boolean;
  geometryDirty: boolean;
}

export function evaluateFollowDirty(
  state: ShadowFollowDirtyState,
  sample: FollowSample,
): FollowDirtyFlags {
  const angleChanged =
    Number.isNaN(state.lastElevationDeg) ||
    Math.abs(sample.elevationDeg - state.lastElevationDeg) > SUN_SHADOW_ANGLE_EPS_DEG ||
    Math.abs(sample.azimuthDeg - state.lastAzimuthDeg) > SUN_SHADOW_ANGLE_EPS_DEG;
  const followMoved =
    Number.isNaN(state.lastFollowX) ||
    Math.abs(sample.x - state.lastFollowX) > SUN_SHADOW_FOLLOW_POSITION_EPS_M ||
    Math.abs(sample.z - state.lastFollowZ) > SUN_SHADOW_FOLLOW_POSITION_EPS_M;
  const lightDistanceChanged =
    Number.isNaN(state.lastLightDistance) ||
    Math.abs(sample.lightDistance - state.lastLightDistance) > SUN_SHADOW_LIGHT_DISTANCE_EPS_M;

  return {
    angleChanged,
    followMoved,
    lightDistanceChanged,
    geometryDirty: state.needsFullRefresh || angleChanged || followMoved || lightDistanceChanged,
  };
}

export function commitFollowDirtyState(state: ShadowFollowDirtyState, sample: FollowSample): void {
  state.lastElevationDeg = sample.elevationDeg;
  state.lastAzimuthDeg = sample.azimuthDeg;
  state.lastFollowX = sample.x;
  state.lastFollowZ = sample.z;
  state.lastLightDistance = sample.lightDistance;
  state.needsFullRefresh = false;
}

/**
 * Pose a directional shadow light at follow XZ with current sun spherical.
 * Snap only when the light basis is stable (see {@link finalizeShadowLightPose}).
 */
export function poseDirectionalShadowFollow(
  light: DirectionalLight,
  sample: FollowSample,
  snapFollow: boolean,
): void {
  sunDirectionFromSpherical(sample.elevationDeg, sample.azimuthDeg, _sunDir);
  light.target.position.set(sample.x, 0, sample.z);
  light.target.updateMatrixWorld();
  light.position.copy(light.target.position).addScaledVector(_sunDir, sample.lightDistance);
  light.updateMatrixWorld();
  finalizeShadowLightPose(light, snapFollow);
}

/** Build a follow sample from current sun azimuth + caller elevation / focus / distance. */
export function makeFollowSample(
  x: number,
  z: number,
  elevationDeg: number,
  lightDistance: number,
): FollowSample {
  return {
    elevationDeg,
    azimuthDeg: currentSunAzimuthDeg(),
    x,
    z,
    lightDistance,
  };
}
