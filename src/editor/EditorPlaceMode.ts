// src/editor/EditorPlaceMode.ts — entity preview, selection, gizmo, drag-drop (place tool)
import type { PerspectiveCamera, Scene } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { getMapEntities } from '../map/MapIO';
import type { MapFile } from '../map/MapTypes';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { type EditorDragDropContext, initEditorDragDrop } from './EditorDragDrop';
import type { EditorEntityStore } from './EditorEntityStore';
import {
  createEntitySelectionController,
  type EntitySelectionContext,
} from './EntitySelectionController';
import {
  createEntityTransformGizmo,
  type EntityTransformGizmoContext,
} from './EntityTransformGizmo';
import { createMapEntityPreview, type MapEntityPreviewContext } from './MapEntityPreview';

export type EntityChangeOptions = { rebuild?: boolean };

export interface EditorPlaceModeContext {
  preview: MapEntityPreviewContext;
  selection: EntitySelectionContext;
  gizmo: EntityTransformGizmoContext;
  dragDrop: EditorDragDropContext;
  onEntitiesChanged: (opts?: EntityChangeOptions) => void;
  rebind: (terrain: MapTerrainContext, map?: MapFile) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

export function createEditorPlaceMode(
  scene: Scene,
  assets: AssetRegistry,
  terrain: MapTerrainContext,
  store: EditorEntityStore,
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  isCameraNavigate: () => boolean,
  onSelectionChange: (uids: readonly string[]) => void,
): EditorPlaceModeContext {
  const entityPreview = createMapEntityPreview(scene, assets, terrain, store);
  entityPreview.sync();

  const transformGizmo = createEntityTransformGizmo(
    scene,
    camera,
    canvas,
    terrain.mesh,
    store,
    () => entityPreview,
    {
      onChanged: (opts?: EntityChangeOptions) => {
        if (opts?.rebuild === false) {
          entityPreview.updateOutlineTransforms();
          transformGizmo.update();
          return;
        }
        entityPreview.sync();
        transformGizmo.update();
      },
    },
  );

  const entitySelection = createEntitySelectionController(
    store,
    () => entityPreview,
    camera,
    canvas,
    isCameraNavigate,
    {
      onSelectionChange,
      onChanged: (opts?: EntityChangeOptions) => {
        if (opts?.rebuild === false) {
          entityPreview.updateOutlineTransforms();
          transformGizmo.update();
          return;
        }
        entityPreview.sync();
        transformGizmo.update();
      },
    },
  );

  const dragDrop = initEditorDragDrop(canvas, camera, terrain.mesh, store, () => {
    entityPreview.sync();
    transformGizmo.update();
  });

  const onEntitiesChanged = (opts?: EntityChangeOptions): void => {
    if (opts?.rebuild === false) {
      entityPreview.updateOutlineTransforms();
      transformGizmo.update();
      return;
    }
    entityPreview.sync();
    transformGizmo.update();
  };

  return {
    preview: entityPreview,
    selection: entitySelection,
    gizmo: transformGizmo,
    dragDrop,
    onEntitiesChanged,
    rebind(nextTerrain, map) {
      if (map) {
        store.loadFromMapEntities(getMapEntities(map));
      }
      entityPreview.rebindTerrain(nextTerrain);
      entityPreview.sync();
      transformGizmo.rebindTerrainMesh(nextTerrain.mesh);
      dragDrop.rebindTerrainMesh(nextTerrain.mesh);
    },
    setEnabled(enabled) {
      entitySelection.setEnabled(enabled);
      dragDrop.setEnabled(enabled);
      transformGizmo.setEnabled(enabled);
      if (!enabled) transformGizmo.setSelectedUids([]);
    },
    dispose() {
      dragDrop.dispose();
      transformGizmo.dispose();
      entitySelection.dispose();
      entityPreview.dispose();
    },
  };
}
