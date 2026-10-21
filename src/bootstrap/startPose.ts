// src/bootstrap/startPose.ts — where the player and the camera start: the map's start, or the saved game's

import { PHASE0 } from '../config/phase0';
import type { PlayerStartPose } from '../map/MapTypes';
import type { BootRestore } from '../save/bootSave';

export interface StartPose {
  x: number;
  z: number;
  yawRad: number;
  pitchRad: number;
}

export function startPoseOf(boot: BootRestore | null, mapStart: PlayerStartPose): StartPose {
  if (boot) {
    const { player, camera } = boot.profile;
    return { x: player.x, z: player.z, yawRad: camera.yaw, pitchRad: camera.pitch };
  }
  return {
    x: mapStart.x,
    z: mapStart.z,
    yawRad: mapStart.rotY ?? PHASE0.CAMERA.INITIAL_YAW,
    pitchRad: PHASE0.CAMERA.INITIAL_PITCH,
  };
}
