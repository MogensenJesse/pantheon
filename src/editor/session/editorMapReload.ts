// src/editor/session/editorMapReload.ts — load/switch map into live terrain + entities

import { WORLD } from '../../config/world';
import {
  inferBiomePaintRulesFromGrids,
  parseBiomePaintRules,
} from '../../map/authoring/applyBiomeRules';
import type { MapGrids } from '../../map/MapGrids';
import type { BiomePaintRules, MapFile, MapGrassSettings } from '../../map/MapTypes';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { EditorDirtyTracker, EditorHistoryContext } from '../core/EditorHistory';
import { defaultTerrainShape, type EditorTerrainShapeContext } from '../core/EditorTerrainShape';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import type { EditorPlaceModeContext } from '../place/EditorPlaceMode';

export interface EditorMapMetaState {
  id: string;
  persisted: boolean;
  grass: MapGrassSettings | undefined;
  biomePaintRules?: BiomePaintRules;
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
  prewarmCache: () => void;
  syncChrome: () => void;
  syncTerrainShape: () => void;
  syncBiomePaintRules: (rules: BiomePaintRules) => void;
}

export type EditorMapReload = (newGrids: MapGrids, map?: MapFile, persisted?: boolean) => void;

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
    prewarmCache,
    syncChrome,
    syncTerrainShape,
    syncBiomePaintRules,
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

    const biomeRules =
      (map ? parseBiomePaintRules(map.biomePaintRules) : null) ??
      inferBiomePaintRulesFromGrids(terrain.grids, WORLD.SIZE);
    mapMeta.biomePaintRules = biomeRules;
    syncBiomePaintRules(biomeRules);

    bumpGridEpoch();
    terrain.applyHeightsToMesh();
    placeMode.preview.refreshSurfaceHeights();
    terrain.uploadBiomeMap();
    placeMode.rebind(terrain, map);
    placeMode.selection.clearSelection();
    history.clear();
    resetSnapshotCache();
    prewarmCache();
    dirtyTracker.markClean();
    syncTerrainShape();
    store.patch({ selectionCount: 0 });
    syncChrome();
  };
}
