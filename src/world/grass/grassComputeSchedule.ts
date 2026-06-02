// src/world/grass/grassComputeSchedule.ts — Tier 1 adaptive grass compute dispatch
import type { Matrix4 } from 'three';

export type GrassComputePass = 'full' | 'visibility';

/** Player moved more than this (m) in XZ → full compute with tile wrap. */
export const GRASS_MOVE_EPS_SQ = 0.02 * 0.02;

/** Squared delta on camera matrix elements before a visibility-only pass. */
const GRASS_CAM_MATRIX_EPS_SQ = 1e-10;

/** Full compute every N idle frames (height/scale/trail refresh while standing still). */
export const GRASS_IDLE_FULL_INTERVAL = 4;

const _prevCamElements = new Float32Array(16);
let camInitialized = false;

export function resetGrassComputeSchedule(): void {
  camInitialized = false;
}

export function chooseGrassComputePass(
  deltaXZLengthSq: number,
  cameraMatrix: Matrix4,
  idleFrameCounter: number,
): GrassComputePass | null {
  const moved = deltaXZLengthSq > GRASS_MOVE_EPS_SQ;
  if (moved) return 'full';

  const camChanged = cameraMatrixChanged(cameraMatrix);
  if (camChanged) return 'visibility';

  if (idleFrameCounter > 0 && idleFrameCounter % GRASS_IDLE_FULL_INTERVAL === 0) {
    return 'full';
  }

  return null;
}

function cameraMatrixChanged(matrix: Matrix4): boolean {
  const e = matrix.elements;
  if (!camInitialized) {
    for (let i = 0; i < 16; i++) _prevCamElements[i] = e[i];
    camInitialized = true;
    return true;
  }

  let sumSq = 0;
  for (let i = 0; i < 16; i++) {
    const d = e[i] - _prevCamElements[i];
    sumSq += d * d;
  }

  if (sumSq > GRASS_CAM_MATRIX_EPS_SQ) {
    for (let i = 0; i < 16; i++) _prevCamElements[i] = e[i];
    return true;
  }

  return false;
}
