// src/editor/MapEntityPreview.ts — non-instanced preview clones for picking + selection outlines
import type { Group, Object3D, Scene } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import type { EditorEntityStore } from './EditorEntityStore';
import { createEntityPreviewHighlights } from './mapEntityPreviewHighlights';
import { createEntityPreviewMeshes } from './mapEntityPreviewMeshes';

export interface MapEntityPreviewContext {
  root: Group;
  sync: () => void;
  applyEntityTransform: (uid: string) => void;
  refreshSurfaceHeights: () => void;
  getPickables: () => Object3D[];
  getObjectRoot: (uid: string) => Object3D | null;
  findUidForObject: (obj: Object3D) => string | null;
  setHighlight: (hoveredUid: string | null, selectedUids: ReadonlySet<string>) => void;
  updateOutlineTransforms: () => void;
  rebindTerrain: (terrain: MapTerrainContext) => void;
  dispose: () => void;
}

export function createMapEntityPreview(
  scene: Scene,
  assets: AssetRegistry,
  terrain: MapTerrainContext,
  store: EditorEntityStore,
): MapEntityPreviewContext {
  const meshes = createEntityPreviewMeshes(scene, assets);
  const highlights = createEntityPreviewHighlights(scene);
  let terrainCtx = terrain;
  let syncPending = false;

  const rebuild = () => {
    meshes.rebuild(store, terrainCtx, (uid, obj) => {
      highlights.attach(uid, obj);
    });
    highlights.setSelection(null, new Set());
  };

  const sync = () => {
    if (syncPending) return;
    syncPending = true;
    requestAnimationFrame(() => {
      syncPending = false;
      rebuild();
    });
  };

  return {
    root: meshes.root,
    sync,
    applyEntityTransform: (uid) => {
      meshes.applyEntityTransform(uid, store, terrainCtx, (id) => {
        highlights.updateOutlinesForUid(id);
      });
    },
    refreshSurfaceHeights: () => {
      for (const { uid } of store.getAll()) {
        meshes.applyEntityTransform(uid, store, terrainCtx, (id) => {
          highlights.updateOutlinesForUid(id);
        });
      }
    },
    getPickables: () => meshes.getPickables(),
    getObjectRoot: (uid) => meshes.getObjectRoot(uid),
    findUidForObject: (obj) => meshes.findUidForObject(obj),
    setHighlight: (hovered, selected) => highlights.setSelection(hovered, selected),
    updateOutlineTransforms: () => highlights.updateOutlineTransforms(),
    rebindTerrain: (next) => {
      terrainCtx = next;
    },
    dispose: () => {
      scene.remove(meshes.root);
      highlights.disposeAll();
    },
  };
}
