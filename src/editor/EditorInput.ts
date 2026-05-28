// src/editor/EditorInput.ts — pointer raycast against terrain mesh
import { Raycaster, Vector2, type Mesh, type PerspectiveCamera } from 'three';

export interface EditorHit {
  x: number;
  z: number;
  y: number;
}

export interface EditorInputContext {
  getHit: () => EditorHit | null;
  isPointerDown: () => boolean;
  isShiftDown: () => boolean;
  isSpaceDown: () => boolean;
  dispose: () => void;
}

export interface EditorInputOptions {
  /** When true, LMB is reserved for camera orbit (no tool raycast). */
  isCameraNavigate?: () => boolean;
}

let blockNextTerrainPointer = false;
let blockNextEntityPointer = false;

/** Call from entity selection (capture) so sculpt/paint ignore this LMB press. */
export function blockTerrainPointer(): void {
  blockNextTerrainPointer = true;
}

/** Call from transform gizmo (capture) so entity selection ignores this LMB press. */
export function blockEntityPointer(): void {
  blockNextEntityPointer = true;
}

export function consumeEntityPointerBlock(): boolean {
  if (!blockNextEntityPointer) return false;
  blockNextEntityPointer = false;
  return true;
}

export function initEditorInput(
  domElement: HTMLElement,
  camera: PerspectiveCamera,
  terrainMesh: Mesh,
  options: EditorInputOptions = {},
): EditorInputContext {
  const isCameraNavigate = options.isCameraNavigate ?? (() => false);
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let pointerDown = false;
  let shiftDown = false;
  let lastHit: EditorHit | null = null;

  const updateHit = (clientX: number, clientY: number): EditorHit | null => {
    const rect = domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(terrainMesh, false);
    if (hits.length === 0) {
      lastHit = null;
      return null;
    }
    const p = hits[0].point;
    lastHit = { x: p.x, z: p.z, y: p.y };
    return lastHit;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (isCameraNavigate()) return;
    if (blockNextTerrainPointer) {
      blockNextTerrainPointer = false;
      return;
    }
    pointerDown = true;
    domElement.setPointerCapture(e.pointerId);
    updateHit(e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    updateHit(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointerDown = false;
    try {
      domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') shiftDown = true;
    if (e.code === 'Space') pointerDown = false;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') shiftDown = false;
  };

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    getHit: () => lastHit,
    isPointerDown: () => pointerDown,
    isShiftDown: () => shiftDown,
    isSpaceDown: () => isCameraNavigate(),
    dispose: () => {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}
