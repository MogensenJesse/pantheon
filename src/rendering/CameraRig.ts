// src/rendering/CameraRig.ts — third-person orbit follow
import { PerspectiveCamera, Vector3 } from 'three';
import type { MovementAxes } from '../entities/types';
import { PHASE0 } from '../config/phase0';

export type { MovementAxes } from '../entities/types';

const { CAMERA } = PHASE0;

const _desiredCam = new Vector3();
const _desiredLook = new Vector3();
const _smoothLook = new Vector3();
const _offset = new Vector3();
const _camForward = new Vector3();

export interface CameraRig {
  update: (playerPosition: Vector3, delta: number, yaw: number, pitch: number) => void;
  /** Horizontal forward = where the camera looks (orb moves away from camera on W). */
  getMovementAxes: () => MovementAxes;
  getYaw: () => number;
}

function computeOrbitPosition(
  playerPosition: Vector3,
  yaw: number,
  pitch: number,
  outCam: Vector3,
  outLook: Vector3,
): void {
  outLook.set(
    playerPosition.x,
    playerPosition.y + CAMERA.LOOK_HEIGHT,
    playerPosition.z,
  );
  const horiz = CAMERA.DISTANCE * Math.cos(pitch);
  _offset.set(
    Math.sin(yaw) * horiz,
    CAMERA.DISTANCE * Math.sin(pitch),
    Math.cos(yaw) * horiz,
  );
  outCam.copy(outLook).add(_offset);
}

export function initCameraRig(
  camera: PerspectiveCamera,
  startX: number,
  startZ: number,
  startWorldY: number,
): CameraRig {
  camera.fov = CAMERA.FOV;
  camera.updateProjectionMatrix();

  let lastYaw: number = CAMERA.INITIAL_YAW;
  const playerStart = new Vector3(startX, startWorldY, startZ);

  computeOrbitPosition(
    playerStart,
    CAMERA.INITIAL_YAW,
    CAMERA.INITIAL_PITCH,
    _desiredCam,
    _desiredLook,
  );
  camera.position.copy(_desiredCam);
  _smoothLook.copy(_desiredLook);
  camera.lookAt(_smoothLook);

  const getMovementAxes = (): MovementAxes => {
    camera.getWorldDirection(_camForward);
    let fx = _camForward.x;
    let fz = _camForward.z;
    let len = Math.hypot(fx, fz);
    if (len < 1e-4) {
      fx = -Math.sin(lastYaw);
      fz = -Math.cos(lastYaw);
      len = Math.hypot(fx, fz) || 1;
    }
    fx /= len;
    fz /= len;
    return {
      forwardX: fx,
      forwardZ: fz,
      rightX: -fz,
      rightZ: fx,
    };
  };

  return {
    update(playerPosition, delta, yaw, pitch) {
      lastYaw = yaw;
      const posT = 1 - Math.exp(-CAMERA.POSITION_SMOOTH * delta);
      const lookT = 1 - Math.exp(-CAMERA.LOOK_SMOOTH * delta);

      computeOrbitPosition(playerPosition, yaw, pitch, _desiredCam, _desiredLook);
      camera.position.lerp(_desiredCam, posT);
      _smoothLook.lerp(_desiredLook, lookT);
      camera.lookAt(_smoothLook);
    },
    getMovementAxes,
    getYaw: () => lastYaw,
  };
}
