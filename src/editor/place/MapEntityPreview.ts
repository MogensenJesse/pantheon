// src/editor/place/MapEntityPreview.ts — non-instanced preview clones for picking + selection outlines
import type { Group, Object3D, Scene } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import { WORLD } from '../../config/world';
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import { isWorldPointInDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { EditorEntityStore, StoredMapEntity } from '../core/EditorEntityStore';
import { createEntityPreviewHighlights } from './mapEntityPreviewHighlights';
import { createEntityPreviewMeshes } from './mapEntityPreviewMeshes';
import { diffEntitySnapshots } from './reconcileEntityPreview';

export interface MapEntityPreviewContext {
  root: Group;
  sync: () => void;
  addEntities: (uids: readonly string[], opts?: { withHighlights?: boolean }) => void;
  removeEntities: (uids: readonly string[]) => void;
  reconcileEntities: (
    prevEntities: readonly StoredMapEntity[],
    opts?: { withHighlights?: boolean },
  ) => void;
  applyEntityTransform: (uid: string) => void;
  refreshSurfaceHeights: (region?: GridDirtyRegion) => void;
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
    highlights.disposeAll();
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
    addEntities: (uids, opts?: { withHighlights?: boolean }) => {
      if (!uids.length) return;
      const withHighlights = opts?.withHighlights !== false;
      meshes.addEntities(uids, store, terrainCtx, (uid, obj) => {
        if (withHighlights) highlights.attach(uid, obj);
      });
    },
    removeEntities: (uids) => {
      if (!uids.length) return;
      for (const uid of uids) highlights.detach(uid);
      meshes.removeEntities(uids);
    },
    reconcileEntities: (prevEntities, opts) => {
      const withHighlights = opts?.withHighlights !== false;
      const { removed, added, updated, replaced } = diffEntitySnapshots(
        prevEntities,
        store.getAll(),
      );

      if (removed.length > 0) {
        for (const uid of removed) highlights.detach(uid);
        meshes.removeEntities(removed);
      }
      if (replaced.length > 0) {
        for (const uid of replaced) highlights.detach(uid);
        meshes.removeEntities(replaced);
        meshes.addEntities(replaced, store, terrainCtx, (uid, obj) => {
          if (withHighlights) highlights.attach(uid, obj);
        });
      }
      if (added.length > 0) {
        meshes.addEntities(added, store, terrainCtx, (uid, obj) => {
          if (withHighlights) highlights.attach(uid, obj);
        });
      }
      for (const uid of updated) {
        meshes.applyEntityTransform(uid, store, terrainCtx, (id) => {
          highlights.updateOutlinesForUid(id);
        });
      }
    },
    applyEntityTransform: (uid) => {
      meshes.applyEntityTransform(uid, store, terrainCtx, (id) => {
        highlights.updateOutlinesForUid(id);
      });
    },
    refreshSurfaceHeights: (region?: GridDirtyRegion) => {
      for (const { uid, entity } of store.getAll()) {
        if (
          region &&
          !isWorldPointInDirtyRegion(entity.x, entity.z, region, terrainCtx.grids.size, WORLD.SIZE)
        ) {
          continue;
        }
        meshes.applyEntityTransform(uid, store, terrainCtx, (id) => {
          highlights.updateOutlinesForUid(id);
        });
      }
    },
    getPickables: () => meshes.getPickables(),
    getObjectRoot: (uid) => meshes.getObjectRoot(uid),
    findUidForObject: (obj) => meshes.findUidForObject(obj),
    setHighlight: (hovered, selected) => {
      const ensureHighlight = (uid: string) => {
        if (highlights.get(uid)) return;
        const obj = meshes.getObjectRoot(uid);
        if (obj) highlights.attach(uid, obj);
      };
      if (hovered) ensureHighlight(hovered);
      for (const uid of selected) ensureHighlight(uid);
      highlights.setSelection(hovered, selected);
    },
    updateOutlineTransforms: () => highlights.updateOutlineTransforms(),
    rebindTerrain: (next) => {
      terrainCtx = next;
    },
    dispose: () => {
      highlights.disposeAll();
      meshes.dispose();
    },
  };
}
