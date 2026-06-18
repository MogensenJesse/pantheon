// src/editor/EditorInput.ts — pointer raycast against terrain mesh
import { type Object3D, type PerspectiveCamera, Raycaster, Vector2 } from 'three';

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

class EditorInputController implements EditorInputContext {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private pointerDown = false;
  private shiftDown = false;
  private lastHit: EditorHit | null = null;

  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;

  constructor(
    private readonly domElement: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly terrainMesh: Object3D,
    private readonly isCameraNavigate: () => boolean,
  ) {
    this.onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.shiftDown = e.shiftKey;
      if (this.isCameraNavigate()) return;
      if (blockNextTerrainPointer) {
        blockNextTerrainPointer = false;
        return;
      }
      this.pointerDown = true;
      this.domElement.setPointerCapture(e.pointerId);
      this.updateHit(e.clientX, e.clientY);
    };

    this.onPointerMove = (e: PointerEvent) => {
      this.shiftDown = e.shiftKey;
      this.updateHit(e.clientX, e.clientY);
    };

    this.onPointerLeave = () => {
      this.lastHit = null;
    };

    this.onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.pointerDown = false;
      try {
        this.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };

    this.onKeyDown = (e: KeyboardEvent) => {
      this.shiftDown = e.shiftKey;
      if (e.code === 'Space') this.pointerDown = false;
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.shiftDown = e.shiftKey;
    };

    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerenter', this.onPointerMove);
    this.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private updateHit(clientX: number, clientY: number): EditorHit | null {
    const rect = this.domElement.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.terrainMesh, true);
    if (hits.length === 0) {
      this.lastHit = null;
      return null;
    }
    const p = hits[0].point;
    this.lastHit = { x: p.x, z: p.z, y: p.y };
    return this.lastHit;
  }

  getHit(): EditorHit | null {
    return this.lastHit;
  }

  isPointerDown(): boolean {
    return this.pointerDown;
  }

  isShiftDown(): boolean {
    return this.shiftDown;
  }

  isSpaceDown(): boolean {
    return this.isCameraNavigate();
  }

  dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.domElement.removeEventListener('pointerenter', this.onPointerMove);
    this.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

export function initEditorInput(
  domElement: HTMLElement,
  camera: PerspectiveCamera,
  terrainMesh: Object3D,
  options: EditorInputOptions = {},
): EditorInputContext {
  const isCameraNavigate = options.isCameraNavigate ?? (() => false);
  return new EditorInputController(domElement, camera, terrainMesh, isCameraNavigate);
}
