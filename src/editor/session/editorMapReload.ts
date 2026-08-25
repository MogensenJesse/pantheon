// src/editor/session/editorMapReload.ts — load/switch map into live terrain + entities

import type { MapGrids } from '../../map/MapGrids';
import type { MapFile, MapGrassSettings } from '../../map/MapTypes';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { EditorDirtyTracker } from '../core/EditorHistory';
import type { EditorHistoryContext } from '../core/EditorHistory';
import {
  type EditorTerrainShapeContext,
  defaultTerrainShape,
} from '../core/EditorTerrainShape';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import type { EditorPlaceModeContext } from '../place/EditorPlaceMode';

export interface EditorMapMetaState {
  id: string;
  persisted: boolean;
  grass: MapGrassSettings | undefined;
}

export interface CreateEditorMapReloadDeps {
  terrain: MapTerrainContext;
  sculptBase: Float32Array;
  shapeCtrl: EditorTerrainShapeContext;
  getPlaceMode: () => EditorPlaceModeContext;
  history: EditorHistoryContext;
  dirtyTracker: EditorDirtyTracker;
  store: EditorWorkspaceStore;
  mapMeta: EditorMapMetaState;
  bumpGridEpoch: () => void;
  resetSnapshotCache: () => void;
  syncChrome: () => void;
  syncTerrainShape: () => void;
}

export type EditorMapReload = (
  newGrids: MapGrids,
  map?: MapFile,
  persisted?: boolean,
) => void;

export function createEditorMapReload(deps: CreateEditorMapReloadDeps): EditorMapReload {
  const {
    terrain,
    sculptBase,
    shapeCtrl,
    getPlaceMode,
    history,
    dirtyTracker,
    store,
    mapMeta,
    bumpGridEpoch,
    resetSnapshotCache,
    syncChrome,
    syncTerrainShape,
  } = deps;

  return (newGrids, map, persisted = false) => {
    const placeMode = getPlaceMode();
    terrain.grids.height.set(newGrids.height);
    terrain.grids.biome.set(newGrids.biome);

    if (map) {
      mapMeta.id = map.id;
      mapMeta.persisted = persisted;
      mapMeta.grass = map.grass;
      shapeCtrl.setShape(
        map.terrainShape
          ? { ...defaultTerrainShape(), ...map.terrainShape }
          : defaultTerrainShape(),
      );
      if (map.heightBase?.data && map.heightBase.data.length === newGrids.size * newGrids.size) {
        sculptBase.set(map.heightBase.data);
      } else {
        sculptBase.set(newGrids.height);
        shapeCtrl.invertFromDisplayHeight();
      }
    } else {
      sculptBase.set(newGrids.height);
      shapeCtrl.setShape(defaultTerrainShape());
      mapMeta.grass = undefined;
    }

    bumpGridEpoch();
    terrain.applyHeightsToMesh();
    placeMode.preview.refreshSurfaceHeights();
    terrain.uploadBiomeMap();
    placeMode.rebind(terrain, map);
    placeMode.selection.clearSelection();
    history.clear();
    resetSnapshotCache();
    dirtyTracker.markClean();
    syncTerrainShape();
    store.patch({ selectionCount: 0 });
    syncChrome();
  };
}
