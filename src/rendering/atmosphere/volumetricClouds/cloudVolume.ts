// src/rendering/atmosphere/volumetricClouds/cloudVolume.ts — player-follow AABB volume state
import { Vector3 } from 'three';
import { type CloudTunables, defaultCloudTunables } from './cloudTunables';

export interface CloudVolumeState {
  originXZ: { x: number; z: number };
  baseY: number;
  topY: number;
  halfExtent: number;
}

export interface CloudAabb {
  min: Vector3;
  max: Vector3;
}

const _aabbMin = new Vector3();
const _aabbMax = new Vector3();

let volumeState: CloudVolumeState | null = null;

/** Bootstrap volume extents from shipped tunables (or an override copy). */
export function initCloudVolume(tunables: CloudTunables = defaultCloudTunables()): void {
  volumeState = {
    originXZ: { x: 0, z: 0 },
    baseY: tunables.baseHeightM,
    topY: tunables.topHeightM,
    halfExtent: tunables.volumeHalfExtentM,
  };
}

/** Follow the player XZ — same direct tracking as grass ring roots. */
export function updateCloudVolumeOrigin(playerX: number, playerZ: number): void {
  if (!volumeState) return;
  volumeState.originXZ.x = playerX;
  volumeState.originXZ.z = playerZ;
}

export function getCloudVolumeState(): CloudVolumeState | null {
  return volumeState;
}

/** World-space axis-aligned bounds for ray–AABB entry (march pass uses this in Phase 2). */
export function getCloudAabb(outMin = _aabbMin, outMax = _aabbMax): CloudAabb {
  const state = volumeState ?? {
    originXZ: { x: 0, z: 0 },
    baseY: defaultCloudTunables().baseHeightM,
    topY: defaultCloudTunables().topHeightM,
    halfExtent: defaultCloudTunables().volumeHalfExtentM,
  };
  const { x, z } = state.originXZ;
  const h = state.halfExtent;
  outMin.set(x - h, state.baseY, z - h);
  outMax.set(x + h, state.topY, z + h);
  return { min: outMin, max: outMax };
}
