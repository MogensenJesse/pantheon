// src/editor/core/EditorSession.ts — map editor runtime (tools, terrain, place mode, loop)
import { Color, PointLight, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { AssetRegistry } from '../../assets/assetManifest';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import {
  profileBeginFrame,
  profileEndFrame,
  profileMark,
  setPerformanceOverlayEnabled,
  setThreeInspectorVisible,
} from '../../dev/profiling';
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import {
  copyGridBufferRegion,
  expandDirtyRegion,
  gridRegionHasDiff,
} from '../../map/authoring/gridDirtyRegion';
import { defaultBiomeBlurRadiusCells } from '../../map/biomeWeightBake';
import { createEmptyMapGrids, type MapGrids } from '../../map/MapGrids';
import type { MapFile, MapTerrainShape } from '../../map/MapTypes';
import { BiomeId } from '../../map/MapTypes';
import {
  initValleyFogEditorAtmosphere,
  setValleyFogEditorPreview,
} from '../../rendering/atmosphere/valleyFog';
import type { SceneContext } from '../../rendering/SceneSetup';
import {
  buildMapTerrain,
  disposeMapTerrain,
  type MapTerrainContext,
} from '../../world/MapTerrainBuilder';
import { syncTerrainSplatLighting } from '../../world/terrain';
import { createEditorPlaceMode } from '../place/EditorPlaceMode';
import { createPaintBiomeTool } from '../tools/PaintBiomeTool';
import { createPropBrushTool } from '../tools/PropBrushTool';
import { createSculptTool, type SculptFlushQuality } from '../tools/SculptTool';
import { initEditorAssetSidebar } from '../ui/EditorAssetSidebar';
import { disposeAssetThumbnails } from '../ui/EditorAssetThumbnails';
import { initEditorBiomeSidebar } from '../ui/EditorBiomeSidebar';
import { type EditorToolId, initEditorUI, type PlaceSubMode } from '../ui/EditorUI';
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
import {
  cloneTerrainShape,
  createEditorTerrainShape,
  defaultTerrainShape,
} from './EditorTerrainShape';

const _editorPlayerPos = new Vector3(0, 4, 0);

export interface EditorSession {
  run: () => void;
  dispose: () => void;
}

export interface EditorSessionDeps {
  canvas: HTMLCanvasElement;
  setup: SceneContext;
  textures: Awaited<ReturnType<typeof import('../../world/terrain').loadTerrainTextures>>;
  assets: AssetRegistry;
  loadingEl: HTMLElement | null;
}

export function createEditorSession(deps: EditorSessionDeps): EditorSession {
  const { canvas, setup, textures, assets, loadingEl } = deps;
  const { renderer, scene, sun, ambientLight } = setup;

  scene.background = new Color(0x3a4550);
  sun.intensity = 1.1;
  sun.castShadow = false;

  const fixedSunDir = new Vector3(0.55, 0.75, 0.45).normalize();
  sun.position.copy(fixedSunDir).multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  let mapMeta = { id: 'new-map' };
  let mapPersisted = false;

  const grids = createEmptyMapGrids();
  /** Stable buffer — reload/undo copy into this so SculptTool closure stays valid. */
  const sculptBase = new Float32Array(grids.height);

  const terrain: MapTerrainContext = buildMapTerrain(scene, textures, sun, grids, {
    receiveShadow: false,
    castShadow: false,
    vertexDisplacement: false,
    meshSegments: VISUAL.terrain.editorMeshSegments,
    lod: false,
    editorWaterPreview: true,
    renderer,
  });

  const editorCam = initEditorCamera(canvas);

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
  let editorUi!: ReturnType<typeof initEditorUI>;

  const applyTerrainHeights = (region?: GridDirtyRegion) => {
    terrain.applyHeightsToMesh(region);
    placeMode?.preview.refreshSurfaceHeights(region);
  };

  /** Bumps when height / sculptBase / biome / terrainShape mutate (history CoW). */
  let liveGridEpoch = 0;
  let lastCapturedGridEpoch = -1;
  let lastCapturedEntityEpoch = -1;
  let cachedSnapHeight: Float32Array | null = null;
  let cachedSnapSculpt: Float32Array | null = null;
  let cachedSnapBiome: Uint8Array | null = null;
  let cachedSnapShape: MapTerrainShape | null = null;
  let cachedSnapEntities: StoredMapEntity[] | null = null;

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

  let sculpt!: ReturnType<typeof createSculptTool>;

  const flushSculpt = (region: GridDirtyRegion | undefined, quality: SculptFlushQuality) => {
    if (quality === 'soften') {
      shapeCtrl.bakeSoften(region);
      return;
    }
    shapeCtrl.derive(quality, region);
  };

  sculpt = createSculptTool({
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
      heightChanged = gridRegionHasDiff(terrain.grids.height, snap.height, region, gridSize);
      const baseChanged = gridRegionHasDiff(sculptBase, snap.sculptBase, region, gridSize);
      biomeChanged = gridRegionHasDiff(terrain.grids.biome, snap.biome, region, gridSize);
      if (heightChanged) copyGridBufferRegion(terrain.grids.height, snap.height, region, gridSize);
      if (baseChanged) copyGridBufferRegion(sculptBase, snap.sculptBase, region, gridSize);
      if (biomeChanged) copyGridBufferRegion(terrain.grids.biome, snap.biome, region, gridSize);
    } else {
      terrain.grids.height.set(snap.height);
      sculptBase.set(snap.sculptBase);
      terrain.grids.biome.set(snap.biome);
    }

    shapeCtrl.setShape(snap.terrainShape);
    editorUi?.syncTerrainShapePanel();

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

    if (heightChanged) {
      placeMode.preview.refreshSurfaceHeights(region);
    }

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
    (uids) => placeMode.gizmo.setSelectedUids(uids),
    history,
  );

  let propBrush!: ReturnType<typeof createPropBrushTool>;
  const brushMixIds: string[] = [];

  propBrush = createPropBrushTool(entityStore, input, () => brushMixIds, {
    onEntitiesAdded: (uids) =>
      placeMode.preview.addEntities(uids, { withHighlights: false, lod: 2 }),
    onEntitiesRemoved: (uids) => placeMode.preview.removeEntities(uids),
  });

  const assetSidebar = initEditorAssetSidebar(assets, {
    onBrushDensity: (density) => propBrush.setOptions({ density }),
    onBrushSpacing: (spacing) => propBrush.setOptions({ spacing }),
  });

  assetSidebar.onBrushSetChange((ids) => {
    brushMixIds.length = 0;
    brushMixIds.push(...ids);
  });

  const biomeSidebar = initEditorBiomeSidebar({
    onBiomeChange: (biome) => paint.setOptions({ biome }),
  });

  let activeTool: EditorToolId = 'sculpt';
  let placeSubMode: PlaceSubMode = 'single';
  let lastTime = performance.now();
  let strokeBefore: EditorSnapshot | null = null;
  let wasPointerDown = false;
  let shapeGestureBefore: EditorSnapshot | null = null;

  const syncPlaceInteractions = (): void => {
    const singlePlace = activeTool === 'place' && placeSubMode === 'single';
    placeMode.setEnabled(singlePlace);
    assetSidebar.setPlaceSubMode(placeSubMode);
  };

  const strokeGridRegion = (): GridDirtyRegion | undefined => {
    if (activeTool === 'sculpt') return sculpt.getStrokeRegion();
    if (activeTool === 'paint') return paint.getStrokeRegion();
    return undefined;
  };

  const beginToolStroke = (onBegin?: () => void) => {
    strokeBefore = history.beginGesture();
    onBegin?.();
  };

  const commitToolStroke = (onEnd?: () => void) => {
    if (!strokeBefore) {
      wasPointerDown = false;
      return;
    }
    onEnd?.();
    history.commitGesture(strokeBefore, strokeGridRegion());
    strokeBefore = null;
    wasPointerDown = false;
  };

  const applyEditorMode = (tool: EditorToolId): void => {
    commitToolStroke(() => {
      if (activeTool === 'place' && placeSubMode === 'brush') propBrush.endStroke();
    });
    activeTool = tool;
    assetSidebar.setVisible(tool === 'place');
    biomeSidebar.setVisible(tool === 'paint');
    syncPlaceInteractions();
  };

  const reloadMap = (newGrids: MapGrids, map?: MapFile, persisted = false) => {
    terrain.grids.height.set(newGrids.height);
    terrain.grids.biome.set(newGrids.biome);

    if (map) {
      mapMeta = { id: map.id };
      mapPersisted = persisted;
      shapeCtrl.setShape(
        map.terrainShape
          ? { ...defaultTerrainShape(), ...map.terrainShape }
          : defaultTerrainShape(),
      );
      if (map.heightBase && map.heightBase.data.length === newGrids.size * newGrids.size) {
        sculptBase.set(map.heightBase.data);
        shapeCtrl.derive('final');
      } else {
        // Legacy: keep authored display height; base mirrors height until first shape/sculpt.
        sculptBase.set(newGrids.height);
        bumpGridEpoch();
        terrain.applyHeightsToMesh();
      }
    } else {
      sculptBase.set(newGrids.height);
      shapeCtrl.setShape(defaultTerrainShape());
      bumpGridEpoch();
      terrain.applyHeightsToMesh();
    }

    placeMode.preview.refreshSurfaceHeights();
    terrain.uploadBiomeMap();
    placeMode.rebind(terrain, map);
    placeMode.selection.clearSelection();
    history.clear();
    lastCapturedGridEpoch = -1;
    lastCapturedEntityEpoch = -1;
    cachedSnapHeight = null;
    cachedSnapEntities = null;
    strokeBefore = null;
    wasPointerDown = false;
    shapeGestureBefore = null;
    dirtyTracker.markClean();
    editorUi.syncTerrainShapePanel();
  };

  editorUi = initEditorUI({
    onToolChange: applyEditorMode,
    onPlaceSubModeChange: (mode) => {
      if (placeSubMode === 'brush' && mode !== 'brush') {
        commitToolStroke(() => propBrush.endStroke());
      }
      placeSubMode = mode;
      syncPlaceInteractions();
    },
    onBrushRadius: (radius) => {
      sculpt.setOptions({ radius });
      paint.setOptions({ radius });
      propBrush.setOptions({ radius });
    },
    onBrushHardness: (hardness) => paint.setOptions({ hardness }),
    onSculptStrength: (strength) => sculpt.setOptions({ strength }),
    onSofteningChange: (soften) => sculpt.setOptions({ soften }),
    getTerrainShape: () => shapeCtrl.getShape(),
    getHeightBase: () => sculptBase,
    onTerrainSeedChange: (seed) => {
      shapeCtrl.setShape({
        ...shapeCtrl.getShape(),
        seed: Math.max(1, Math.floor(seed) || 1),
      });
      bumpGridEpoch();
    },
    onGenerateTerrain: () => {
      const before = history.beginGesture();
      shapeCtrl.generate();
      history.commitGesture(before);
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
    },
    onFogPreviewChange: (enabled) => {
      setValleyFogEditorPreview(scene, enabled);
    },
    onPerfOverlayChange: (enabled) => {
      setPerformanceOverlayEnabled(enabled);
    },
    onPerfInspectorChange: (enabled) => {
      setThreeInspectorVisible(enabled);
    },
    onMapLoaded: (map, loadedGrids, persisted = false) => reloadMap(loadedGrids, map, persisted),
    onMapSaved: (map) => {
      mapMeta = { id: map.id };
      mapPersisted = true;
      dirtyTracker.markClean();
    },
    getGrids: () => terrain.grids,
    getMapMeta: () => ({ ...mapMeta, persisted: mapPersisted }),
    serializeEntities: () => entityStore.serialize(),
    isDirty: () => dirtyTracker.isDirty(),
  });

  paint.setOptions({ biome: BiomeId.Forest });
  sculpt.setOptions({
    strength: 0.04,
    soften: false,
  });
  applyEditorMode(editorUi.getActiveTool());
  placeSubMode = editorUi.getPlaceSubMode();
  syncPlaceInteractions();
  shapeCtrl.warmCache();
  dirtyTracker.markClean();

  const runLoop = () => {
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      editorCam.update();

      syncTerrainSplatLighting(
        terrain.splatMaterial,
        _editorPlayerPos,
        editorPlayerLight,
        sun,
        ambientLight,
        editorCam.camera,
      );

      if (activeTool === 'sculpt' || activeTool === 'paint') {
        const pointerDown = input.isPointerDown() && !input.isSpaceDown();
        if (pointerDown && !wasPointerDown) {
          beginToolStroke(() => {
            if (activeTool === 'sculpt') sculpt.beginStroke();
            else paint.beginStroke();
          });
        }
        if (activeTool === 'sculpt') sculpt.update(dt);
        else paint.update(dt);
        if (!pointerDown && wasPointerDown) commitToolStroke();
        else wasPointerDown = pointerDown;
      } else if (activeTool === 'place' && placeSubMode === 'brush') {
        const pointerDown = input.isPointerDown() && !input.isSpaceDown();
        if (pointerDown && !wasPointerDown) {
          beginToolStroke(() => propBrush.beginStroke());
        }
        propBrush.update(dt);
        if (!pointerDown && wasPointerDown) commitToolStroke(() => propBrush.endStroke());
        else wasPointerDown = pointerDown;
      } else {
        commitToolStroke();
      }

      if (activeTool === 'sculpt' || activeTool === 'paint') {
        const hit = input.getHit();
        const navigating = input.isSpaceDown();
        if (activeTool === 'sculpt') {
          const opts = sculpt.getOptions();
          brushPreview.update(hit, {
            radius: opts.radius,
            visible: !navigating,
          });
        } else {
          const opts = paint.getOptions();
          brushPreview.update(hit, {
            radius: opts.radius,
            hardness: opts.hardness,
            visible: !navigating,
          });
        }
      } else if (activeTool === 'place' && placeSubMode === 'brush') {
        const hit = input.getHit();
        const navigating = input.isSpaceDown();
        brushPreview.update(hit, {
          radius: propBrush.getOptions().radius,
          visible: !navigating,
        });
      } else {
        brushPreview.update(null, { radius: 0, visible: false });
      }

      if (activeTool === 'place' && placeSubMode === 'single') {
        placeMode.gizmo.update();
      }

      profileBeginFrame();
      profileMark('editor');
      renderer.render(scene, editorCam.camera);
      profileEndFrame(renderer as WebGPURenderer);
    });
  };

  return {
    run: () => {
      void (renderer as WebGPURenderer).compileAsync(scene, editorCam.camera).then(() => {
        if (loadingEl) loadingEl.classList.add('hidden');
        runLoop();
      });
    },
    dispose: () => {
      shapeCtrl.dispose();
      renderer.setAnimationLoop(null);
      unbindHistoryKeys();
      history.dispose();
      placeMode.dispose();
      biomeSidebar.dispose();
      assetSidebar.dispose();
      editorUi.dispose();
      brushPreview.dispose();
      input.dispose();
      editorCam.dispose();
      scene.remove(editorPlayerLight);
      disposeMapTerrain(terrain);
      textures.dispose();
      disposeAssetThumbnails();
    },
  };
}
