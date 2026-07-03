// src/editor/place/EditorDragDrop.ts — drag assets from sidebar onto terrain
import { type Object3D, type PerspectiveCamera, Raycaster } from 'three';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import type { EditorHistoryRecorder } from '../core/EditorHistory';
import { raycastTerrain } from '../core/raycast';
import { type PlaceEntityResult, placeEntityAt } from './entityPlacement';

export const PLACE_ID_MIME = 'application/x-pantheon-place-id';

export interface EditorDragDropContext {
  setEnabled: (enabled: boolean) => void;
  rebindTerrainMesh: (mesh: Object3D) => void;
  dispose: () => void;
}

export function initEditorDragDrop(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  terrainMesh: Object3D,
  store: EditorEntityStore,
  onPlaced: (result: PlaceEntityResult) => void,
  history?: EditorHistoryRecorder,
): EditorDragDropContext {
  let terrainTarget = terrainMesh;
  const raycaster = new Raycaster();

  let enabled = true;

  const onDragOver = (e: DragEvent) => {
    if (!enabled) return;
    if (!e.dataTransfer?.types.includes(PLACE_ID_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: DragEvent) => {
    if (!enabled) return;
    const placeId = e.dataTransfer?.getData(PLACE_ID_MIME);
    if (!placeId) return;
    e.preventDefault();
    const hit = raycastTerrain(raycaster, camera, terrainTarget, canvas, e.clientX, e.clientY);
    if (!hit) return;
    const place = () => {
      const result = placeEntityAt(store, placeId, hit.x, hit.z);
      if (result) onPlaced(result);
    };
    if (history) history.recordMutation(place);
    else place();
  };

  canvas.addEventListener('dragover', onDragOver);
  canvas.addEventListener('drop', onDrop);

  return {
    setEnabled: (on) => {
      enabled = on;
    },
    rebindTerrainMesh: (mesh) => {
      terrainTarget = mesh;
    },
    dispose: () => {
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('drop', onDrop);
    },
  };
}
