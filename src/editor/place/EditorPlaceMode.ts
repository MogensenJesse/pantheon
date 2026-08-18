// src/editor/place/EditorPlaceMode.ts — entity preview, selection, gizmo, drag-drop (place tool)
import type { PerspectiveCamera, Scene } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import { getMapEntities } from '../../map/MapIO';
import type { MapFile } from '../../map/MapTypes';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import type { EditorHistoryRecorder } from '../core/EditorHistory';
import type { EditorPointerRouter } from '../core/EditorPointerRouter';
import { type EditorDragDropContext, initEditorDragDrop } from './EditorDragDrop';
import {
  createEntitySelectionController,
  type EntitySelectionContext,
} from './EntitySelectionController';
import {
  createEntityTransformGizmo,
  type EntityTransformGizmoContext,
} from './EntityTransformGizmo';
import { createMapEntityPreview, type MapEntityPreviewContext } from './MapEntityPreview';

export type EntityChangeOptions = { removedUids?: readonly string[] };

export interface EditorPlaceModeContext {
  preview: MapEntityPreviewContext;
  selection: EntitySelectionContext;
  gizmo: EntityTransformGizmoContext;
  dragDrop: EditorDragDropContext;
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
  pointerRouter: EditorPointerRouter,
  onSelectionChange: (uids: readonly string[]) => void,
  history: EditorHistoryRecorder,
): EditorPlaceModeContext {
  const entityPreview = createMapEntityPreview(scene, assets, terrain, store);
  entityPreview.sync();

  let transformGizmo!: EntityTransformGizmoContext;

  const syncPreview = (opts?: EntityChangeOptions): void => {
    if (opts?.removedUids?.length) {
      entityPreview.removeEntities(opts.removedUids);
    } else {
      entityPreview.updateOutlineTransforms();
    }
    transformGizmo.update();
  };

  transformGizmo = createEntityTransformGizmo(
    scene,
    camera,
    canvas,
    terrain.getWorldY,
    store,
    () => entityPreview,
    { onChanged: syncPreview },
    history,
    pointerRouter,
  );

  const entitySelection = createEntitySelectionController(
    store,
    () => entityPreview,
    camera,
    canvas,
    isCameraNavigate,
    pointerRouter,
    {
      onSelectionChange,
      onChanged: syncPreview,
      beginMoveDrag: (e) => transformGizmo.beginMoveDrag(e),
      isDragging: () => transformGizmo.isDragging(),
    },
    history,
  );

  const dragDrop = initEditorDragDrop(
    canvas,
    camera,
    terrain.getWorldY,
    store,
    (result) => {
      if (result.created) entityPreview.addEntities([result.uid]);
      else entityPreview.applyEntityTransform(result.uid);
      transformGizmo.update();
    },
    history,
  );

  return {
    preview: entityPreview,
    selection: entitySelection,
    gizmo: transformGizmo,
    dragDrop,
    rebind(nextTerrain, map) {
      if (map) {
        store.loadFromMapEntities(getMapEntities(map));
      }
      entityPreview.rebindTerrain(nextTerrain);
      entityPreview.sync();
      entitySelection.clearSelection();
      transformGizmo.rebindGetWorldY(nextTerrain.getWorldY);
      dragDrop.rebindGetWorldY(nextTerrain.getWorldY);
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
