// src/core/CameraInput.ts — pointer-lock mouse look on the game canvas
import { PHASE0 } from '../config/phase0';
import { devDebugSettings } from './GameState';

const { CAMERA } = PHASE0;

/** Orbit pitch limits — just inside ±π/2 to avoid horizontal flip. */
const PITCH_MIN_UNCONSTRAINED = -Math.PI / 2 + 0.001;
const PITCH_MAX_UNCONSTRAINED = Math.PI / 2 - 0.001;

function clampPitch(pitch: number): number {
  if (import.meta.env.DEV && devDebugSettings.unconstrainedCameraPitch) {
    return Math.max(PITCH_MIN_UNCONSTRAINED, Math.min(PITCH_MAX_UNCONSTRAINED, pitch));
  }
  return Math.max(CAMERA.PITCH_MIN, Math.min(CAMERA.PITCH_MAX, pitch));
}

export interface CameraInputContext {
  getYaw: () => number;
  getPitch: () => number;
  isLocked: () => boolean;
  dispose: () => void;
}

class CameraInputController implements CameraInputContext {
  private yaw: number = CAMERA.INITIAL_YAW;
  private pitch: number = CAMERA.INITIAL_PITCH;
  private locked = false;

  private readonly onPointerDown: () => void;
  private readonly onPointerLockChange: () => void;
  private readonly onPointerMove: (e: PointerEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    startYaw: number = CAMERA.INITIAL_YAW,
  ) {
    this.yaw = startYaw;
    this.onPointerDown = () => {
      if (document.pointerLockElement === this.canvas) return;
      this.canvas.requestPointerLock();
    };

    this.onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.canvas.classList.toggle('pointer-locked', this.locked);
    };

    this.onPointerMove = (e: PointerEvent) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * CAMERA.YAW_SENSITIVITY;
      this.pitch += e.movementY * CAMERA.PITCH_SENSITIVITY;
      this.pitch = clampPitch(this.pitch);
    };

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointermove', this.onPointerMove);
  }

  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }

  isLocked(): boolean {
    return this.locked;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointermove', this.onPointerMove);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.canvas.classList.remove('pointer-locked');
  }
}

export function initCameraInput(
  canvas: HTMLCanvasElement,
  startYaw: number = CAMERA.INITIAL_YAW,
): CameraInputContext {
  return new CameraInputController(canvas, startYaw);
}
