// src/editor/EditorDragDrop.ts — drag assets from sidebar onto terrain
import { Raycaster, Vector2, type Mesh, type PerspectiveCamera } from 'three';
import type { EditorEntityStore } from './EditorEntityStore';
import { placeEntityAt } from './entityPlacement';

export const PLACE_ID_MIME = 'application/x-pantheon-place-id';

export interface EditorDragDropContext {
  setEnabled: (enabled: boolean) => void;
  rebindTerrainMesh: (mesh: Mesh) => void;
  dispose: () => void;
}

export function initEditorDragDrop(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  terrainMesh: Mesh,
  store: EditorEntityStore,
  onPlaced: () => void,
): EditorDragDropContext {
  let terrainTarget = terrainMesh;
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  const raycastTerrain = (clientX: number, clientY: number): { x: number; z: number } | null => {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(terrainTarget, false);
    if (!hits.length) return null;
    const p = hits[0].point;
    return { x: p.x, z: p.z };
  };

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
    const hit = raycastTerrain(e.clientX, e.clientY);
    if (!hit) return;
    if (placeEntityAt(store, placeId, hit.x, hit.z)) onPlaced();
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
