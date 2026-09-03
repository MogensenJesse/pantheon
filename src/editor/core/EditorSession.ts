// src/editor/core/EditorSession.ts — map editor composition root

import { Color, PointLight } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import { WORLD } from '../../config/world';
import {
  applyBiomeRules,
  inferBiomePaintRulesFromGrids,
} from '../../map/authoring/applyBiomeRules';
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import { scaleHeightFromSource, scanHeightPeak } from '../../map/authoring/scaleMapHeight';
import { defaultBiomeBlurRadiusCells } from '../../map/biomeWeightBake';
import { createEmptyMapGrids } from '../../map/MapGrids';
import { BiomeId } from '../../map/MapTypes';
import { resolveMapWaterHeightNorm } from '../../map/mapWater';
import { defaultTerrainAuxMeta } from '../../map/terrainAux';
import { MAX_MAP_ENTITIES } from '../../map/validateMapPayload';
import { setValleyFogEditorPreview } from '../../rendering/atmosphere';
import type { SceneContext } from '../../rendering/SceneSetup';
import {
  buildMapTerrain,
  disposeMapTerrain,
  type MapTerrainContext,
  setTerrainBiomeDebugVisible,
} from '../../world/MapTerrainBuilder';
import { createEditorPlaceMode } from '../place/EditorPlaceMode';
import { bindActivePlaceOptionsModel, createPlaceOptionsModel } from '../place/placeOptions';
import { createEditorGridHistory } from '../session/editorGridHistory';
import { createEditorMapReload, type EditorMapMetaState } from '../session/editorMapReload';
import { createEditorSessionChrome } from '../session/editorSessionChrome';
import { createPaintBiomeTool } from '../tools/PaintBiomeTool';
import { applyPropBiomeFill, countPropsOnBiome } from '../tools/PropBiomeFill';
import { createPropBrushTool } from '../tools/PropBrushTool';
import { createSculptTool, type SculptFlushQuality } from '../tools/SculptTool';
import {
  bindActiveEditorAssetThumbnails,
  createEditorAssetThumbnailService,
  disposeAssetThumbnails,
} from '../ui/EditorAssetThumbnails';
import { initEditorBiomeLegend } from '../ui/EditorBiomeLegend';
import { bindActiveEditorDialog, createEditorDialogService } from '../ui/editorDialog';
import {
  bindActiveEditorToast,
  createEditorToastService,
  disposeEditorToast,
  setEditorToastParent,
} from '../ui/editorToast';
import type { EditorShellContext } from '../ui/shell/EditorShell';
import { createEditorBrushPreview } from './EditorBrushPreview';
import { initEditorCamera } from './EditorCamera';
import { EditorEntityStore } from './EditorEntityStore';
import type { EditorSnapshot } from './EditorHistory';
import { initEditorInput } from './EditorInput';
import { createEditorPointerRouter } from './EditorPointerRouter';
import { createEditorPropMixModel } from './EditorPropMixModel';
import { createEditorRenderLoop } from './EditorRenderLoop';
import { createEditorTerrainShape } from './EditorTerrainShape';
import { createEditorToolCoordinator } from './EditorToolCoordinator';
import { bindEditorViewport } from './EditorViewportFit';
import { createEditorWorkspaceStore } from './EditorWorkspaceStore';

export interface EditorSession {
  run: () => Promise<void>;
  dispose: () => void;
  hasUnsavedChanges: () => boolean;
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

  const toast = createEditorToastService();
  const dialog = createEditorDialogService();
  const thumbnailService = createEditorAssetThumbnailService();
  const unbindToast = bindActiveEditorToast(toast);
  const unbindDialog = bindActiveEditorDialog(dialog);
  const unbindThumbnails = bindActiveEditorAssetThumbnails(thumbnailService);

  const store = createEditorWorkspaceStore();
  const unbindPlaceOptions = bindActivePlaceOptionsModel(createPlaceOptionsModel());
  const mix = createEditorPropMixModel();
  const unsubLayout = store.subscribe((state) => shell.syncLayout(state));

  setEditorToastParent(shell.slots.overlays);
  toast.setParent(shell.slots.overlays);
  const biomeLegend = initEditorBiomeLegend(shell.slots.overlays);

  sun.position.set(0.55, 0.75, 0.45).normalize().multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  const mapMeta: EditorMapMetaState = {
    id: 'new-map',
    persisted: false,
    grass: undefined,
    heightMode: 'shaped',
    terrainAuxMeta: defaultTerrainAuxMeta(),
  };
  let brushRadius = 12;

  const grids = createEmptyMapGrids();
  const sculptBase = new Float32Array(grids.height);
  const entityStore = new EditorEntityStore();

  const terrain: MapTerrainContext = buildMapTerrain(scene, textures, sun, grids, {
    receiveShadow: false,
    castShadow: false,
    vertexDisplacement: true,
    simpleShading: true,
    editorWaterPreview: true,
    renderer,
  });

  const editorCam = initEditorCamera(canvas);
  const unbindViewport = bindEditorViewport(canvas, renderer, editorCam.camera);
  setValleyFogEditorPreview(false);

  const editorPlayerLight = new PointLight(0xffffff, 0, 6);
  scene.add(editorPlayerLight);

  const pointerRouter = createEditorPointerRouter();
  const input = initEditorInput(canvas, editorCam.camera, terrain.getWorldY, {
    isCameraNavigate: editorCam.isSpaceHeld,
    pointerRouter,
  });
  const brushPreview = createEditorBrushPreview(scene, terrain.getWorldY);

  let placeMode!: ReturnType<typeof createEditorPlaceMode>;
  let chrome!: ReturnType<typeof createEditorSessionChrome>;

  const applyTerrainHeights = (region?: GridDirtyRegion) => {
    terrain.applyHeightsToMesh(region);
    placeMode?.preview.refreshSurfaceHeights(region);
  };

  let gridHistory!: ReturnType<typeof createEditorGridHistory>;

  const shapeCtrl = createEditorTerrainShape({
    grids: terrain.grids,
    sculptBase,
    getMapId: () => mapMeta.id,
    applyHeights: applyTerrainHeights,
    bumpGridEpoch: () => gridHistory.bumpGridEpoch(),
  });

  gridHistory = createEditorGridHistory({
    terrain,
    sculptBase,
    shapeCtrl,
    entityStore,
    getPlaceMode: () => placeMode,
    getSculptProps: () => chrome?.sculptProps,
  });

  const { history, dirtyTracker } = gridHistory;

  const mapHeightM = () => scanHeightPeak(terrain.grids.height) * WORLD.HEIGHT_SCALE;

  let mapHeightGesture: { before: EditorSnapshot; sourcePeak: number } | null = null;
  let mapHeightRaf = 0;
  let mapHeightPendingM: number | null = null;

  const applyMapHeightFromGesture = (meters: number) => {
    if (!mapHeightGesture) return;
    scaleHeightFromSource(
      terrain.grids.height,
      sculptBase,
      mapHeightGesture.before.height,
      meters / WORLD.HEIGHT_SCALE,
      mapHeightGesture.sourcePeak,
    );
    applyTerrainHeights();
  };

  const beginMapHeightGesture = () => {
    if (mapHeightGesture) return;
    const before = history.beginGesture();
    mapHeightGesture = {
      before,
      sourcePeak: scanHeightPeak(before.height),
    };
  };

  const previewMapHeight = (meters: number) => {
    beginMapHeightGesture();
    mapHeightPendingM = meters;
    if (mapHeightRaf) return;
    mapHeightRaf = requestAnimationFrame(() => {
      mapHeightRaf = 0;
      if (mapHeightPendingM === null) return;
      applyMapHeightFromGesture(mapHeightPendingM);
    });
  };

  const commitMapHeight = (meters: number) => {
    if (mapHeightRaf) {
      cancelAnimationFrame(mapHeightRaf);
      mapHeightRaf = 0;
    }
    beginMapHeightGesture();
    applyMapHeightFromGesture(meters);
    mapHeightPendingM = null;
    const gesture = mapHeightGesture;
    mapHeightGesture = null;
    if (!gesture) return;
    const startM = Math.round(gesture.sourcePeak * WORLD.HEIGHT_SCALE);
    if (Math.round(meters) === startM) return;
    gridHistory.bumpGridEpoch();
    history.commitGesture(gesture.before);
    gridHistory.adoptLiveCache();
    syncChrome();
    chrome?.syncMapHeight();
  };

  const syncChrome = () => {
    store.patch({
      mapId: mapMeta.id,
      mapPersisted: mapMeta.persisted,
      dirty: dirtyTracker.isDirty(),
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      entityCount: entityStore.size,
    });
    chrome?.refreshFillEstimate();
  };

  const reloadMap = createEditorMapReload({
    terrain,
    sculptBase,
    shapeCtrl,
    getPlaceMode: () => placeMode,
    history,
    dirtyTracker,
    store,
    mapMeta,
    bumpGridEpoch: gridHistory.bumpGridEpoch,
    resetSnapshotCache: gridHistory.resetSnapshotCache,
    prewarmCache: gridHistory.prewarmCache,
    syncChrome,
    syncTerrainShape: () => {
      chrome?.syncTerrainShape();
      chrome?.syncMapHeight();
    },
    syncBiomePaintRules: (rules) => chrome?.syncBiomePaintRules(rules),
  });

  const flushSculpt = (region: GridDirtyRegion | undefined, quality: SculptFlushQuality) => {
    if (quality === 'soften') {
      shapeCtrl.bakeSoften(region);
      return;
    }
    gridHistory.bumpGridEpoch();
    applyTerrainHeights(region);
  };

  const sculpt = createSculptTool({
    grids: terrain.grids,
    sculptBase,
    input,
    onFlush: flushSculpt,
    worldSize: WORLD.SIZE,
    sampleRidge: (x, z) => shapeCtrl.sampleRidge(x, z),
  });

  const paint = createPaintBiomeTool(
    terrain.grids,
    input,
    (opts) => {
      gridHistory.bumpGridEpoch();
      terrain.uploadBiomeMap(opts);
    },
    WORLD.SIZE,
  );

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

  const propBrush = createPropBrushTool(
    entityStore,
    input,
    {
      getMixIds: () => mix.getIds(),
      getMixWeights: () => mix.getWeights(),
      getGrids: () => terrain.grids,
      worldSize: WORLD.SIZE,
      getWaterHeightNorm: () => resolveMapWaterHeightNorm(mapMeta.water),
    },
    {
      onEntitiesAdded: (uids) => {
        placeMode.preview.addEntities(uids, { withHighlights: false });
        store.patch({ entityCount: entityStore.size });
      },
      onEntitiesRemoved: (uids) => {
        placeMode.preview.removeEntities(uids);
        store.patch({ entityCount: entityStore.size });
      },
    },
  );

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
    onStrokeCommitted: (region) => {
      gridHistory.adoptLiveCache(region);
      chrome?.syncMapHeight();
    },
  });

  chrome = createEditorSessionChrome({
    shell,
    store,
    assets,
    mix,
    services: { toast, dialog, thumbnails: thumbnailService },
    mapDocumentHandlers: {
      getGrids: () => terrain.grids,
      getMapMeta: () => ({ id: mapMeta.id, persisted: mapMeta.persisted }),
      getHeightBase: () => sculptBase,
      getTerrainShape: () => shapeCtrl.getShape(),
      getBiomePaintRules: () => chrome.getBiomePaintRules(),
      onMapLoaded: (map, loadedGrids, persisted = false) => reloadMap(loadedGrids, map, persisted),
      onMapSaved: (map) => {
        mapMeta.id = map.id;
        mapMeta.persisted = true;
        dirtyTracker.markClean();
        syncChrome();
      },
      serializeEntities: () => entityStore.serialize(),
      getGrass: () => mapMeta.grass,
      getHeightMode: () => mapMeta.heightMode,
      getWater: () => mapMeta.water,
      getTerrainAuxMeta: () => mapMeta.terrainAuxMeta,
      isDirty: () => dirtyTracker.isDirty(),
    },
    documentBarHandlers: {
      onUndo: () => {
        history.undo();
        syncChrome();
      },
      onRedo: () => {
        history.redo();
        syncChrome();
      },
      onFogPreviewChange: (enabled) => setValleyFogEditorPreview(enabled),
      onBiomeVisChange: (enabled) => {
        setTerrainBiomeDebugVisible(terrain, enabled);
        biomeLegend.setVisible(enabled);
      },
    },
    toolRailHandlers: {
      onToolChange: coordinator.setTool,
    },
    propertiesTabsHandlers: {
      onPlaceSubModeChange: coordinator.setPlaceSubMode,
      onPaintSubModeChange: coordinator.setPaintSubMode,
    },
    biomeHandlers: {
      onBiomeChange: (biome) => paint.setOptions({ biome }),
    },
    sculptHandlers: {
      getBrushRadius: () => brushRadius,
      getSculptStrength: () => sculpt.getOptions().strength,
      getSoften: () => sculpt.getOptions().soften,
      getRidge: () => sculpt.getOptions().ridge,
      getMapHeightM: () => mapHeightM(),
      onMapHeightInput: previewMapHeight,
      onMapHeightChange: commitMapHeight,
      onBrushRadius: setBrushRadius,
      onSculptStrength: (strength) => sculpt.setOptions({ strength }),
      onSofteningChange: (soften) => sculpt.setOptions({ soften }),
      onRidgeChange: (ridge) => sculpt.setOptions({ ridge }),
      getTerrainShape: () => shapeCtrl.getShape(),
      onTerrainShapeChange: (shape) => {
        shapeCtrl.setShape(shape);
        syncChrome();
      },
    },
    paintHandlers: {
      getBrushRadius: () => brushRadius,
      getBrushHardness: () => paint.getOptions().hardness,
      onBrushRadius: setBrushRadius,
      onBrushHardness: (hardness) => paint.setOptions({ hardness }),
      onApplyBiomeRules: (rules) => {
        const before = history.beginGesture();
        applyBiomeRules(terrain.grids, rules, WORLD.SIZE);
        mapMeta.biomePaintRules = rules;
        gridHistory.bumpGridEpoch();
        terrain.uploadBiomeMap({ blurRadiusCells: defaultBiomeBlurRadiusCells() });
        history.commitGesture(before);
        syncChrome();
      },
    },
    placeHandlers: {
      getBrushRadius: () => brushRadius,
      onBrushRadius: setBrushRadius,
      onBrushDensity: (density) => propBrush.setOptions({ density }),
      onBrushSpacing: (spacing) => propBrush.setOptions({ spacing }),
      onBrushBiome: (biome) => propBrush.setOptions({ biome }),
      onBrushSizeBias: (sizeBias01) => propBrush.setOptions({ sizeBias01 }),
      getFillEstimateContext: () => ({
        grids: terrain.grids,
        entityCount: entityStore.size,
        worldSize: WORLD.SIZE,
        countPropsOnBiome: (biome) => countPropsOnBiome(entityStore, terrain.grids, biome),
        waterHeightNorm: resolveMapWaterHeightNorm(mapMeta.water),
      }),
      onApplyBiomeFill: ({
        biome,
        mix: mixIds,
        weights,
        density01,
        spacing,
        sizeBias01,
        replaceExisting,
      }) => {
        if (mixIds.length === 0) {
          toast.show('Shift+click props to build a mix before applying fill.', 'error');
          return;
        }
        const hasWeight = mixIds.some((id) => (weights[id] ?? 1) > 0);
        if (!hasWeight) {
          toast.show('Give at least one mix item a weight above 0.', 'error');
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
          sizeBias01,
          replaceExisting,
          waterHeightNorm: resolveMapWaterHeightNorm(mapMeta.water),
        });
        if (result.removedUids.length > 0) {
          placeMode.preview.removeEntities(result.removedUids);
        }
        if (result.addedUids.length > 0) {
          placeMode.preview.addEntities(result.addedUids, { withHighlights: false });
        }
        history.commitGesture(before);
        const capNote = result.saveCapped ? ` (save cap ${MAX_MAP_ENTITIES})` : '';
        const action = replaceExisting
          ? `Fill: removed ${result.removedUids.length}, placed ${result.addedUids.length}`
          : `Fill: placed ${result.addedUids.length}`;
        toast.show(`${action}${capNote}.`, result.saveCapped ? 'error' : 'success');
        syncChrome();
      },
    },
  });

  const unbindSaveKey = chrome.mapDocument.bindKeyboardSave();

  paint.setOptions({ biome: BiomeId.Forest });
  sculpt.setOptions({ strength: 0.04, soften: false, ridge: false });
  setBrushRadius(brushRadius);
  coordinator.syncPlaceInteractions();
  chrome.syncBiomePaintRules(inferBiomePaintRulesFromGrids(terrain.grids, WORLD.SIZE));
  dirtyTracker.markClean();
  syncChrome();

  const loop = createEditorRenderLoop({
    setup,
    editorCam,
    terrain,
    editorPlayerLight,
    tick: (dt) => coordinator.tick(dt),
  });

  let disposed = false;

  return {
    run: async () => {
      try {
        await renderer.compileAsync(scene, editorCam.camera);
        if (disposed) return;
        // Upload height/biome DataTextures and compile copyTextureToTexture so
        // the first sculpt dab does not hitch on a full-grid GPU upload.
        renderer.render(scene, editorCam.camera);
        if (disposed) return;
        gridHistory.prewarmCache();
        const blitWarm = Math.min(127, terrain.grids.size - 1);
        terrain.applyHeightsToMesh({
          iMin: 0,
          iMax: blitWarm,
          jMin: 0,
          jMax: blitWarm,
        });
        if (loadingEl) loadingEl.classList.add('hidden');
        loop.run();
      } catch (err) {
        if (disposed) return;
        console.error('Editor shader warmup failed', err);
        if (loadingEl) {
          loadingEl.textContent = 'Editor failed to start — see console.';
          loadingEl.classList.remove('hidden');
        }
        throw err;
      }
    },
    hasUnsavedChanges: () => dirtyTracker.isDirty(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (mapHeightRaf) cancelAnimationFrame(mapHeightRaf);
      loop.dispose();
      unbindPlaceOptions();
      unbindToast();
      unbindDialog();
      unbindThumbnails();
      unbindViewport();
      unsubLayout();
      unsubHistory();
      unbindHistoryKeys();
      unbindSaveKey();
      history.dispose();
      placeMode.dispose();
      chrome.dispose();
      biomeLegend.dispose();
      toast.dispose();
      thumbnailService.dispose();
      disposeEditorToast();
      disposeAssetThumbnails();
      brushPreview.dispose();
      input.dispose();
      editorCam.dispose();
      scene.remove(editorPlayerLight);
      disposeMapTerrain(terrain);
      textures.dispose();
      shell.dispose();
    },
  };
}
