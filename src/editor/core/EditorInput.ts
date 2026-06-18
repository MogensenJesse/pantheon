// src/editor/core/EditorInput.ts — pointer raycast against terrain mesh
import { type Object3D, type PerspectiveCamera, Raycaster } from 'three';
import type { EditorPointerRouter } from './EditorPointerRouter';
import { raycastTerrain } from './raycast';

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
  pointerRouter?: EditorPointerRouter;
}

class EditorInputController implements EditorInputContext {
  private readonly raycaster = new Raycaster();
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
    private readonly pointerRouter: EditorPointerRouter,
  ) {
    this.onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.shiftDown = e.shiftKey;
      if (this.isCameraNavigate()) return;
      if (this.pointerRouter.consumeTerrainPointerBlock()) return;
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
    const hit = raycastTerrain(
      this.raycaster,
      this.camera,
      this.terrainMesh,
      this.domElement,
      clientX,
      clientY,
    );
    if (!hit) {
      this.lastHit = null;
      return null;
    }
    this.lastHit = { x: hit.x, z: hit.z, y: hit.y };
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
  if (!options.pointerRouter) {
    throw new Error('initEditorInput requires pointerRouter');
  }
  return new EditorInputController(
    domElement,
    camera,
    terrainMesh,
    isCameraNavigate,
    options.pointerRouter,
  );
}
