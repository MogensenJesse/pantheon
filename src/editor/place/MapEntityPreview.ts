// src/editor/place/MapEntityPreview.ts — instanced prop previews + selection outlines
import type { Camera, Object3D, Ray, Scene } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import { WORLD } from '../../config/world';
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import { isWorldPointInDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { EditorEntityStore, StoredMapEntity } from '../core/EditorEntityStore';
import type { ScreenRect } from './EditorScreenRect';
import type { EditorPropPreviewLod } from './editorPropPreviewLod';
import { createEntityPreviewHighlights } from './mapEntityPreviewHighlights';
import { createEntityPreviewMeshes } from './mapEntityPreviewMeshes';
import { diffEntitySnapshots } from './reconcileEntityPreview';

export interface MapEntityPreviewContext {
  sync: () => void;
  addEntities: (
    uids: readonly string[],
    opts?: { withHighlights?: boolean; lod?: EditorPropPreviewLod },
  ) => void;
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
  pickUid: (ray: Ray) => string | null;
  getScreenRect: (uid: string, camera: Camera, canvasRect: DOMRect) => ScreenRect | null;
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
    meshes.rebuild(store, terrainCtx, () => {});
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

  const liveHighlightUids = (
    hovered: string | null,
    selected: ReadonlySet<string>,
  ): Set<string> => {
    const live = new Set(selected);
    if (hovered) live.add(hovered);
    return live;
  };

  return {
    sync,
    addEntities: (uids, opts) => {
      if (!uids.length) return;
      const withHighlights = opts?.withHighlights === true;
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
      const withHighlights = opts?.withHighlights === true;
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
      const uids: string[] = [];
      for (const { uid, entity } of store.getAll()) {
        if (
          region &&
          !isWorldPointInDirtyRegion(entity.x, entity.z, region, terrainCtx.grids.size, WORLD.SIZE)
        ) {
          continue;
        }
        uids.push(uid);
      }
      meshes.refreshSurfaceHeights(store, terrainCtx, uids, (id) => {
        highlights.updateOutlinesForUid(id);
      });
    },
    getPickables: () => meshes.getPickables(),
    getObjectRoot: (uid) => meshes.promote(uid, store, terrainCtx, assets),
    findUidForObject: (obj) => meshes.findUidForObject(obj),
    pickUid: (ray) => meshes.pickUid(ray),
    getScreenRect: (uid, camera, canvasRect) => meshes.getScreenRect(uid, camera, canvasRect),
    setHighlight: (hovered, selected) => {
      const live = liveHighlightUids(hovered, selected);
      highlights.setSelection(hovered, selected);
      meshes.setPromoted(live, store, terrainCtx, assets);
      const ensureHighlight = (uid: string) => {
        if (highlights.get(uid)) return;
        const obj = meshes.getObjectRoot(uid) ?? meshes.promote(uid, store, terrainCtx, assets);
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
