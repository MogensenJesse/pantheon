// src/editor/session/editorGridHistory.ts — terrain/entity snapshot + undo history

import {
  copyGridBufferRegion,
  expandDirtyRegion,
  gridRegionHasDiff,
  splatPackedRegion,
} from '../../map/authoring/gridDirtyRegion';
import { defaultBiomeBlurRadiusCells } from '../../map/biomeWeightBake';
import type { MapTerrainShape } from '../../map/MapTypes';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { EditorEntityStore, StoredMapEntity } from '../core/EditorEntityStore';
import {
  createEditorDirtyTracker,
  createEditorHistory,
  type EditorDirtyTracker,
  type EditorHistoryContext,
  type EditorSnapshot,
  terrainShapesEqual,
} from '../core/EditorHistory';
import {
  cloneTerrainShape,
  type EditorTerrainShapeContext,
} from '../core/EditorTerrainShape';
import type { EditorPlaceModeContext } from '../place/EditorPlaceMode';

export interface EditorGridHistoryPlaceMode {
  preview: EditorPlaceModeContext['preview'];
  selection: EditorPlaceModeContext['selection'];
}

export interface EditorGridHistorySculptProps {
  syncTerrainShape: () => void;
}

export interface CreateEditorGridHistoryDeps {
  terrain: MapTerrainContext;
  sculptBase: Float32Array;
  shapeCtrl: EditorTerrainShapeContext;
  entityStore: EditorEntityStore;
  getPlaceMode: () => EditorGridHistoryPlaceMode;
  getSculptProps: () => EditorGridHistorySculptProps | undefined;
}

export interface EditorGridHistoryBundle {
  history: EditorHistoryContext;
  dirtyTracker: EditorDirtyTracker;
  bumpGridEpoch: () => void;
  getShapeGestureBefore: () => EditorSnapshot | null;
  setShapeGestureBefore: (snap: EditorSnapshot | null) => void;
  resetSnapshotCache: () => void;
}

export function createEditorGridHistory(deps: CreateEditorGridHistoryDeps): EditorGridHistoryBundle {
  const { terrain, sculptBase, shapeCtrl, entityStore, getPlaceMode, getSculptProps } = deps;

  let liveGridEpoch = 0;
  let lastCapturedGridEpoch = -1;
  let lastCapturedEntityEpoch = -1;
  let cachedSnapHeight: Float32Array | null = null;
  let cachedSnapSculpt: Float32Array | null = null;
  let cachedSnapBiome: Uint8Array | null = null;
  let cachedSnapShape: MapTerrainShape | null = null;
  let cachedSnapEntities: StoredMapEntity[] | null = null;
  let shapeGestureBefore: EditorSnapshot | null = null;

  const bumpGridEpoch = () => {
    liveGridEpoch++;
  };

  const captureSnapshot = (): EditorSnapshot => {
    if (liveGridEpoch !== lastCapturedGridEpoch || !cachedSnapHeight) {
      cachedSnapHeight = new Float32Array(terrain.grids.height);
      cachedSnapSculpt = new Float32Array(sculptBase);
      cachedSnapBiome = new Uint8Array(terrain.grids.biome);
      cachedSnapShape = cloneTerrainShape(shapeCtrl.getShape());
      lastCapturedGridEpoch = liveGridEpoch;
    }
    const entityEpoch = entityStore.entityEpoch;
    if (entityEpoch !== lastCapturedEntityEpoch || !cachedSnapEntities) {
      cachedSnapEntities = entityStore.snapshot();
      lastCapturedEntityEpoch = entityEpoch;
    }
    return {
      gridEpoch: liveGridEpoch,
      entityEpoch,
      height: cachedSnapHeight,
      sculptBase: cachedSnapSculpt!,
      biome: cachedSnapBiome!,
      terrainShape: cachedSnapShape!,
      entities: cachedSnapEntities,
    };
  };

  const applySnapshot = (snap: EditorSnapshot): void => {
    const placeMode = getPlaceMode();
    const entitiesChanged = snap.entityEpoch !== entityStore.entityEpoch;
    const prevEntities = entitiesChanged ? [...entityStore.getAll()] : [];

    if (snap.gridEpoch === liveGridEpoch) {
      if (entitiesChanged) {
        entityStore.restoreSnapshot(snap.entities, snap.entityEpoch);
        lastCapturedEntityEpoch = snap.entityEpoch;
        cachedSnapEntities = snap.entities;
        placeMode.preview.reconcileEntities(prevEntities, { withHighlights: false });
      }
      placeMode.selection.clearSelection();
      return;
    }

    const { size: gridSize } = terrain.grids;
    const region = snap.gridRegion;
    let heightChanged = true;
    let biomeChanged = true;

    if (region) {
      if (snap.packed) {
        splatPackedRegion(terrain.grids.height, snap.height, region, gridSize);
        splatPackedRegion(sculptBase, snap.sculptBase, region, gridSize);
        splatPackedRegion(terrain.grids.biome, snap.biome, region, gridSize);
        heightChanged = true;
        biomeChanged = true;
      } else {
        heightChanged = gridRegionHasDiff(terrain.grids.height, snap.height, region, gridSize);
        const baseChanged = gridRegionHasDiff(sculptBase, snap.sculptBase, region, gridSize);
        biomeChanged = gridRegionHasDiff(terrain.grids.biome, snap.biome, region, gridSize);
        if (heightChanged) {
          copyGridBufferRegion(terrain.grids.height, snap.height, region, gridSize);
        }
        if (baseChanged) copyGridBufferRegion(sculptBase, snap.sculptBase, region, gridSize);
        if (biomeChanged) copyGridBufferRegion(terrain.grids.biome, snap.biome, region, gridSize);
      }
    } else {
      terrain.grids.height.set(snap.height);
      sculptBase.set(snap.sculptBase);
      terrain.grids.biome.set(snap.biome);
    }

    shapeCtrl.setShape(snap.terrainShape);
    getSculptProps()?.syncTerrainShape();

    liveGridEpoch = snap.gridEpoch;
    cachedSnapHeight = snap.height;
    cachedSnapSculpt = snap.sculptBase;
    cachedSnapBiome = snap.biome;
    cachedSnapShape = snap.terrainShape;
    lastCapturedGridEpoch = snap.gridEpoch;

    if (entitiesChanged) {
      entityStore.restoreSnapshot(snap.entities, snap.entityEpoch);
      lastCapturedEntityEpoch = snap.entityEpoch;
      cachedSnapEntities = snap.entities;
    }

    if (heightChanged) terrain.applyHeightsToMesh(region);
    if (biomeChanged) {
      const blurRadius = defaultBiomeBlurRadiusCells();
      terrain.uploadBiomeMap({
        region: region ? expandDirtyRegion(region, blurRadius, gridSize) : undefined,
        blurRadiusCells: blurRadius,
      });
    }

    if (entitiesChanged) {
      placeMode.preview.reconcileEntities(prevEntities, { withHighlights: false });
    }
    if (heightChanged) placeMode.preview.refreshSurfaceHeights(region);
    placeMode.selection.clearSelection();
  };

  const history = createEditorHistory({
    capture: captureSnapshot,
    apply: applySnapshot,
    gestureChanged: (before) =>
      before.gridEpoch !== liveGridEpoch ||
      before.entityEpoch !== entityStore.entityEpoch ||
      !terrainShapesEqual(before.terrainShape, shapeCtrl.getShape()),
  });

  const dirtyTracker = createEditorDirtyTracker(() => ({
    gridEpoch: liveGridEpoch,
    terrainShape: shapeCtrl.getShape(),
    entities: entityStore.getAll(),
  }));

  const resetSnapshotCache = () => {
    lastCapturedGridEpoch = -1;
    lastCapturedEntityEpoch = -1;
    cachedSnapHeight = null;
    cachedSnapEntities = null;
    shapeGestureBefore = null;
  };

  return {
    history,
    dirtyTracker,
    bumpGridEpoch,
    getShapeGestureBefore: () => shapeGestureBefore,
    setShapeGestureBefore: (snap) => {
      shapeGestureBefore = snap;
    },
    resetSnapshotCache,
  };
}
