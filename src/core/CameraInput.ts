// src/core/CameraInput.ts — pointer-lock mouse look on the game canvas
import { PHASE0 } from '../config/phase0';

const { CAMERA } = PHASE0;

export interface CameraInputContext {
  getYaw: () => number;
  getPitch: () => number;
  isLocked: () => boolean;
  dispose: () => void;
}

export function initCameraInput(canvas: HTMLCanvasElement): CameraInputContext {
  let yaw: number = CAMERA.INITIAL_YAW;
  let pitch: number = CAMERA.INITIAL_PITCH;
  let locked = false;

  const onPointerDown = () => {
    if (document.pointerLockElement === canvas) return;
    canvas.requestPointerLock();
  };

  const onPointerLockChange = () => {
    locked = document.pointerLockElement === canvas;
    canvas.classList.toggle('pointer-locked', locked);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * CAMERA.YAW_SENSITIVITY;
    pitch += e.movementY * CAMERA.PITCH_SENSITIVITY;
    pitch = Math.max(CAMERA.PITCH_MIN, Math.min(CAMERA.PITCH_MAX, pitch));
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointermove', onPointerMove);

  return {
    getYaw: () => yaw,
    getPitch: () => pitch,
    isLocked: () => locked,
    dispose: () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointermove', onPointerMove);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      canvas.classList.remove('pointer-locked');
    },
  };
}
