// src/editor/core/EditorSession.ts — map editor composition root

import { Color, PointLight } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { setPerformanceOverlayEnabled, setThreeInspectorVisible } from '../../dev/profiling';
import { applyBiomeRules } from '../../map/authoring/applyBiomeRules';
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import {
  copyGridBufferRegion,
  expandDirtyRegion,
  gridRegionHasDiff,
  splatPackedRegion,
} from '../../map/authoring/gridDirtyRegion';
import { defaultBiomeBlurRadiusCells } from '../../map/biomeWeightBake';
import { createEmptyMapGrids, type MapGrids } from '../../map/MapGrids';
import type { MapFile, MapGrassSettings, MapTerrainShape } from '../../map/MapTypes';
import { BiomeId } from '../../map/MapTypes';
import { MAX_MAP_ENTITIES } from '../../map/validateMapPayload';
import {
  initValleyFogEditorAtmosphere,
  setValleyFogEditorPreview,
} from '../../rendering/atmosphere/valleyFog';
import type { SceneContext } from '../../rendering/SceneSetup';
import {
  buildMapTerrain,
  disposeMapTerrain,
  type MapTerrainContext,
  setTerrainBiomeDebugVisible,
} from '../../world/MapTerrainBuilder';
import { createEditorMapDocument } from '../document/EditorMapDocument';
import { createEditorPlaceMode } from '../place/EditorPlaceMode';
import { createPaintBiomeTool } from '../tools/PaintBiomeTool';
import { applyPropBiomeFill } from '../tools/PropBiomeFill';
import { createPropBrushTool } from '../tools/PropBrushTool';
import { createSculptTool, type SculptFlushQuality } from '../tools/SculptTool';
import { createEditorAssetBrowser } from '../ui/EditorAssetBrowser';
import { disposeAssetThumbnails } from '../ui/EditorAssetThumbnails';
import { createEditorBiomeBrowser } from '../ui/EditorBiomeBrowser';
import { initEditorBiomeLegend } from '../ui/EditorBiomeLegend';
import { createEditorDocumentBar } from '../ui/EditorDocumentBar';
import { createEditorStatusBar } from '../ui/EditorStatusBar';
import { createEditorToolRail } from '../ui/EditorToolRail';
import { disposeEditorToast, setEditorToastParent, showEditorToast } from '../ui/editorToast';
import { createPaintPropertiesPanel } from '../ui/PaintPropertiesPanel';
import { createPlacePropertiesPanel } from '../ui/PlacePropertiesPanel';
import { createSculptPropertiesPanel } from '../ui/SculptPropertiesPanel';
import type { EditorShellContext } from '../ui/shell/EditorShell';
import { createEditorBrushPreview } from './EditorBrushPreview';
import { initEditorCamera } from './EditorCamera';
import { EditorEntityStore, type StoredMapEntity } from './EditorEntityStore';
import {
  createEditorDirtyTracker,
  createEditorHistory,
  type EditorSnapshot,
  terrainShapesEqual,
} from './EditorHistory';
import { initEditorInput } from './EditorInput';
import { createEditorPointerRouter } from './EditorPointerRouter';
import { createEditorPropMixModel } from './EditorPropMixModel';
import { createEditorRenderLoop } from './EditorRenderLoop';
import {
  cloneTerrainShape,
  createEditorTerrainShape,
  defaultTerrainShape,
} from './EditorTerrainShape';
import { createEditorToolCoordinator } from './EditorToolCoordinator';
import { bindEditorViewport } from './EditorViewportFit';
import { createEditorWorkspaceStore } from './EditorWorkspaceStore';

export interface EditorSession {
  run: () => void;
  dispose: () => void;
}

export interface EditorSessionDeps {
  canvas: HTMLCanvasElement;
  shell: EditorShellContext;
  setup: SceneContext;
  textures: Awaited<ReturnType<typeof import('../../world/terrain').loadTerrainTextures>>;
  assets: AssetRegistry;
  loadingEl: HTMLElement | null;
}

export function createEditorSession(deps: EditorSessionDeps): EditorSession {
  const { canvas, shell, setup, textures, assets, loadingEl } = deps;
  const { renderer, scene, sun } = setup;

  scene.background = new Color(0x3a4550);
  sun.intensity = 1.1;
  sun.castShadow = false;

  const store = createEditorWorkspaceStore();
  const mix = createEditorPropMixModel();
  const unsubLayout = store.subscribe((state) => shell.syncLayout(state));

  shell.slots.libraryToggle.addEventListener('click', () => {
    store.patch({ libraryCollapsed: !store.get().libraryCollapsed });
  });
  shell.slots.propertiesToggle.addEventListener('click', () => {
    store.patch({ propertiesCollapsed: !store.get().propertiesCollapsed });
  });

  setEditorToastParent(shell.slots.overlays);
  const biomeLegend = initEditorBiomeLegend(shell.slots.overlays);

  const fixedSunDir = { x: 0.55, y: 0.75, z: 0.45 };
  sun.position.set(fixedSunDir.x, fixedSunDir.y, fixedSunDir.z).normalize().multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  let mapMeta = { id: 'new-map' };
  let mapPersisted = false;
  let mapGrass: MapGrassSettings | undefined;
  let brushRadius = 12;

  const grids = createEmptyMapGrids();
  const sculptBase = new Float32Array(grids.height);

  const terrain: MapTerrainContext = buildMapTerrain(scene, textures, sun, grids, {
    receiveShadow: false,
    castShadow: false,
    vertexDisplacement: true,
    meshSegments: VISUAL.terrain.editorMeshSegments,
    lod: false,
    editorWaterPreview: true,
    renderer,
  });

  const editorCam = initEditorCamera(canvas);
  const unbindViewport = bindEditorViewport(canvas, renderer, editorCam.camera);

  initValleyFogEditorAtmosphere();

  const editorPlayerLight = new PointLight(0xffffff, 0, 6);
  scene.add(editorPlayerLight);

  const pointerRouter = createEditorPointerRouter();
  const input = initEditorInput(canvas, editorCam.camera, terrain.getWorldY, {
    isCameraNavigate: editorCam.isSpaceHeld,
    pointerRouter,
  });
  const brushPreview = createEditorBrushPreview(scene, terrain.getWorldY);

  let placeMode!: ReturnType<typeof createEditorPlaceMode>;
  let sculptProps: ReturnType<typeof createSculptPropertiesPanel> | undefined;
  let placeProps: ReturnType<typeof createPlacePropertiesPanel> | undefined;

  const applyTerrainHeights = (region?: GridDirtyRegion) => {
    terrain.applyHeightsToMesh(region);
    placeMode?.preview.refreshSurfaceHeights(region);
  };

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

  const shapeCtrl = createEditorTerrainShape({
    grids: terrain.grids,
    sculptBase,
    getMapId: () => mapMeta.id,
    applyHeights: applyTerrainHeights,
    bumpGridEpoch,
  });

  const flushSculpt = (region: GridDirtyRegion | undefined, quality: SculptFlushQuality) => {
    if (quality === 'soften') {
      shapeCtrl.bakeSoften(region);
      return;
    }
    shapeCtrl.derive(quality, region);
  };

  const sculpt = createSculptTool({
    grids: terrain.grids,
    sculptBase,
    input,
    onFlush: flushSculpt,
    worldSize: WORLD.SIZE,
  });

  const paint = createPaintBiomeTool(
    terrain.grids,
    input,
    (opts) => {
      bumpGridEpoch();
      terrain.uploadBiomeMap(opts);
    },
    WORLD.SIZE,
  );

  const entityStore = new EditorEntityStore();

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
    sculptProps?.syncTerrainShape();

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

  const syncChrome = () => {
    store.patch({
      mapId: mapMeta.id,
      mapPersisted,
      dirty: dirtyTracker.isDirty(),
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      entityCount: entityStore.size,
    });
    placeProps?.refreshFillEstimate();
  };

  const unsubHistory = history.subscribe(syncChrome);
  const unbindHistoryKeys = history.bindKeyboard();

  placeMode = createEditorPlaceMode(
    scene,
    assets,
    terrain,
    entityStore,
    editorCam.camera,
    canvas,
    editorCam.isSpaceHeld,
    pointerRouter,
    (uids) => {
      placeMode.gizmo.setSelectedUids(uids);
      store.patch({ selectionCount: uids.length });
    },
    history,
  );

  const propBrush = createPropBrushTool(entityStore, input, () => mix.getIds(), {
    onEntitiesAdded: (uids) => {
      placeMode.preview.addEntities(uids, { withHighlights: false });
      store.patch({ entityCount: entityStore.size });
    },
    onEntitiesRemoved: (uids) => {
      placeMode.preview.removeEntities(uids);
      store.patch({ entityCount: entityStore.size });
    },
  });

  const setBrushRadius = (radius: number) => {
    brushRadius = radius;
    sculpt.setOptions({ radius });
    paint.setOptions({ radius });
    propBrush.setOptions({ radius });
  };

  const coordinator = createEditorToolCoordinator({
    store,
    history,
    input,
    sculpt,
    paint,
    propBrush,
    placeMode,
    brushPreview,
    onChromeChange: syncChrome,
  });

  const reloadMap = (newGrids: MapGrids, map?: MapFile, persisted = false) => {
    terrain.grids.height.set(newGrids.height);
    terrain.grids.biome.set(newGrids.biome);

    if (map) {
      mapMeta = { id: map.id };
      mapPersisted = persisted;
      mapGrass = map.grass;
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
      mapGrass = undefined;
    }

    bumpGridEpoch();
    terrain.applyHeightsToMesh();
    placeMode.preview.refreshSurfaceHeights();
    terrain.uploadBiomeMap();
    placeMode.rebind(terrain, map);
    placeMode.selection.clearSelection();
    history.clear();
    lastCapturedGridEpoch = -1;
    lastCapturedEntityEpoch = -1;
    cachedSnapHeight = null;
    cachedSnapEntities = null;
    shapeGestureBefore = null;
    dirtyTracker.markClean();
    sculptProps?.syncTerrainShape();
    store.patch({ selectionCount: 0 });
    syncChrome();
  };

  let mapDocument!: ReturnType<typeof createEditorMapDocument>;
  const documentBar = createEditorDocumentBar(shell.slots.documentBar, store, () => mapDocument, {
    onUndo: () => {
      history.undo();
      syncChrome();
    },
    onRedo: () => {
      history.redo();
      syncChrome();
    },
    onFogPreviewChange: (enabled) => setValleyFogEditorPreview(scene, enabled),
    onBiomeVisChange: (enabled) => {
      setTerrainBiomeDebugVisible(terrain, enabled);
      biomeLegend.setVisible(enabled);
    },
    onPerfOverlayChange: (enabled) => setPerformanceOverlayEnabled(enabled),
    onPerfInspectorChange: (enabled) => setThreeInspectorVisible(enabled),
  });

  mapDocument = createEditorMapDocument(documentBar.mapList, {
    getGrids: () => terrain.grids,
    getMapMeta: () => ({ ...mapMeta, persisted: mapPersisted }),
    getHeightBase: () => sculptBase,
    getTerrainShape: () => shapeCtrl.getShape(),
    onMapLoaded: (map, loadedGrids, persisted = false) => reloadMap(loadedGrids, map, persisted),
    onMapSaved: (map) => {
      mapMeta = { id: map.id };
      mapPersisted = true;
      dirtyTracker.markClean();
      syncChrome();
    },
    serializeEntities: () => entityStore.serialize(),
    getGrass: () => mapGrass,
    isDirty: () => dirtyTracker.isDirty(),
  });

  const unbindSaveKey = mapDocument.bindKeyboardSave();

  const toolRail = createEditorToolRail(shell.slots.toolRail, store, {
    onToolChange: coordinator.setTool,
    onPlaceSubModeChange: coordinator.setPlaceSubMode,
    onPaintSubModeChange: coordinator.setPaintSubMode,
  });

  const assetBrowser = createEditorAssetBrowser(shell.slots.libraryBody, assets, store, mix);
  const biomeBrowser = createEditorBiomeBrowser(shell.slots.libraryBody, store, {
    onBiomeChange: (biome) => paint.setOptions({ biome }),
  });

  sculptProps = createSculptPropertiesPanel(shell.slots.propertiesBody, store, {
    getBrushRadius: () => brushRadius,
    getSculptStrength: () => sculpt.getOptions().strength,
    getSoften: () => sculpt.getOptions().soften,
    onBrushRadius: setBrushRadius,
    onSculptStrength: (strength) => sculpt.setOptions({ strength }),
    onSofteningChange: (soften) => sculpt.setOptions({ soften }),
    getTerrainShape: () => shapeCtrl.getShape(),
    onTerrainSeedChange: (seed) => {
      shapeCtrl.setShape({
        ...shapeCtrl.getShape(),
        seed: Math.max(1, Math.floor(seed) || 1),
      });
      bumpGridEpoch();
      syncChrome();
    },
    onGenerateTerrain: () => {
      if (
        !window.confirm(
          'Generate procedural terrain? This replaces the current heightfield (including imported EXR maps).',
        )
      ) {
        return;
      }
      const before = history.beginGesture();
      shapeCtrl.generate();
      history.commitGesture(before);
      syncChrome();
    },
    onTerrainShapeChange: (shape, phase) => {
      if (phase === 'input') {
        if (!shapeGestureBefore) shapeGestureBefore = history.beginGesture();
        shapeCtrl.setShape(shape);
        shapeCtrl.schedulePreview();
        return;
      }
      shapeCtrl.setShape(shape);
      shapeCtrl.flushFinal();
      if (shapeGestureBefore) {
        history.commitGesture(shapeGestureBefore);
        shapeGestureBefore = null;
      }
      syncChrome();
    },
  });

  const paintProps = createPaintPropertiesPanel(shell.slots.propertiesBody, store, {
    getBrushRadius: () => brushRadius,
    getBrushHardness: () => paint.getOptions().hardness,
    onBrushRadius: setBrushRadius,
    onBrushHardness: (hardness) => paint.setOptions({ hardness }),
    onApplyBiomeRules: (rules) => {
      const before = history.beginGesture();
      applyBiomeRules(terrain.grids, rules, WORLD.SIZE);
      bumpGridEpoch();
      terrain.uploadBiomeMap({ blurRadiusCells: defaultBiomeBlurRadiusCells() });
      history.commitGesture(before);
      syncChrome();
    },
  });

  placeProps = createPlacePropertiesPanel(shell.slots.propertiesBody, store, mix, {
    getBrushRadius: () => brushRadius,
    onBrushRadius: setBrushRadius,
    onBrushDensity: (density) => propBrush.setOptions({ density }),
    onBrushSpacing: (spacing) => propBrush.setOptions({ spacing }),
    getFillEstimateContext: () => ({
      grids: terrain.grids,
      entityCount: entityStore.size,
      worldSize: WORLD.SIZE,
    }),
    onApplyBiomeFill: ({ biome, mix: mixIds, weights, density01, spacing }) => {
      if (mixIds.length === 0) {
        showEditorToast('Shift+click props to build a mix before applying fill.', 'error');
        return;
      }
      const hasWeight = mixIds.some((id) => (weights[id] ?? 1) > 0);
      if (!hasWeight) {
        showEditorToast('Give at least one mix item a weight above 0.', 'error');
        return;
      }
      const before = history.beginGesture();
      const result = applyPropBiomeFill({
        store: entityStore,
        grids: terrain.grids,
        worldSize: WORLD.SIZE,
        biome,
        mix: mixIds,
        weights,
        density01,
        spacing,
      });
      if (result.removedUids.length > 0) {
        placeMode.preview.removeEntities(result.removedUids);
      }
      if (result.addedUids.length > 0) {
        placeMode.preview.addEntities(result.addedUids, { withHighlights: false });
      }
      history.commitGesture(before);
      const capNote = result.saveCapped ? ` (save cap ${MAX_MAP_ENTITIES})` : '';
      showEditorToast(
        `Fill: removed ${result.removedUids.length}, placed ${result.addedUids.length}${capNote}.`,
        result.saveCapped ? 'error' : 'success',
      );
      syncChrome();
    },
  });

  const statusBar = createEditorStatusBar(shell.slots.statusBar, store);

  paint.setOptions({ biome: BiomeId.Forest });
  sculpt.setOptions({ strength: 0.04, soften: false });
  setBrushRadius(brushRadius);
  coordinator.syncPlaceInteractions();
  dirtyTracker.markClean();
  syncChrome();

  const loop = createEditorRenderLoop({
    setup,
    editorCam,
    terrain,
    editorPlayerLight,
    tick: (dt) => coordinator.tick(dt),
  });

  return {
    run: () => {
      void renderer.compileAsync(scene, editorCam.camera).then(() => {
        if (loadingEl) loadingEl.classList.add('hidden');
        loop.run();
      });
    },
    dispose: () => {
      loop.dispose();
      unbindViewport();
      unsubLayout();
      unsubHistory();
      unbindHistoryKeys();
      unbindSaveKey();
      history.dispose();
      placeMode.dispose();
      assetBrowser.dispose();
      biomeBrowser.dispose();
      sculptProps?.dispose();
      paintProps.dispose();
      placeProps?.dispose();
      toolRail.dispose();
      documentBar.dispose();
      statusBar.dispose();
      mapDocument.dispose();
      biomeLegend.dispose();
      disposeEditorToast();
      brushPreview.dispose();
      input.dispose();
      editorCam.dispose();
      scene.remove(editorPlayerLight);
      disposeMapTerrain(terrain);
      textures.dispose();
      disposeAssetThumbnails();
      shell.dispose();
    },
  };
}
