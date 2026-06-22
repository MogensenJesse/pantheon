// src/editor/core/EditorSession.ts — map editor runtime (tools, terrain, place mode, loop)
import { Color, PointLight, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { AssetRegistry } from '../../assets/assetManifest';
import { VISUAL } from '../../config/visualTuning';
import { createEmptyMapGrids, type MapGrids } from '../../map/MapGrids';
import type { GridDirtyRegion } from '../../map/gridDirtyRegion';
import type { MapFile } from '../../map/MapTypes';
import { BiomeId } from '../../map/MapTypes';
import type { SceneContext } from '../../rendering/SceneSetup';
import {
  buildMapTerrain,
  disposeMapTerrain,
  type MapTerrainContext,
} from '../../world/MapTerrainBuilder';
import { syncTerrainSplatLighting } from '../../world/terrain';
import { WORLD } from '../../world/WorldConfig';
import { createEditorPlaceMode } from '../place/EditorPlaceMode';
import { typedGridBuffersEqual } from '../place/reconcileEntityPreview';
import { createPaintBiomeTool } from '../tools/PaintBiomeTool';
import { createPropBrushTool } from '../tools/PropBrushTool';
import { fillMountainRidgeDetail } from '../tools/ridgeBatchFill';
import { createSculptTool, type SculptMode } from '../tools/SculptTool';
import { initEditorAssetSidebar } from '../ui/EditorAssetSidebar';
import { initEditorBiomeSidebar } from '../ui/EditorBiomeSidebar';
import { type EditorToolId, type PlaceSubMode, initEditorUI } from '../ui/EditorUI';
import { createEditorBrushPreview } from './EditorBrushPreview';
import { initEditorCamera } from './EditorCamera';
import { EditorEntityStore } from './EditorEntityStore';
import {
  createEditorDirtyTracker,
  createEditorHistory,
  type EditorSnapshot,
} from './EditorHistory';
import { initEditorInput } from './EditorInput';
import { createEditorPointerRouter } from './EditorPointerRouter';

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
  const { renderer, scene, sun, ambientLight, onResize } = setup;

  scene.background = new Color(0x3a4550);
  sun.intensity = 1.1;
  sun.castShadow = false;

  const fixedSunDir = new Vector3(0.55, 0.75, 0.45).normalize();
  sun.position.copy(fixedSunDir).multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  let mapMeta = { id: 'new-map' };
  let mapPersisted = false;

  const grids = createEmptyMapGrids();
  const terrain: MapTerrainContext = buildMapTerrain(scene, textures, sun, grids, {
    receiveShadow: false,
    castShadow: false,
    vertexDisplacement: false,
    meshSegments: VISUAL.terrain.editorMeshSegments,
    lod: false,
    editorWaterPreview: true,
  });

  const editorCam = initEditorCamera(canvas);
  onResize(() => {
    editorCam.camera.aspect = window.innerWidth / window.innerHeight;
    editorCam.camera.updateProjectionMatrix();
  });

  const editorPlayerLight = new PointLight(0xffffff, 0, 6);
  scene.add(editorPlayerLight);

  const pointerRouter = createEditorPointerRouter();

  const input = initEditorInput(canvas, editorCam.camera, terrain.mesh, {
    isCameraNavigate: editorCam.isSpaceHeld,
    pointerRouter,
  });

  const brushPreview = createEditorBrushPreview(scene, terrain.getWorldY);

  let placeMode!: ReturnType<typeof createEditorPlaceMode>;

  const applyTerrainHeights = (region?: GridDirtyRegion) => {
    terrain.applyHeightsToMesh(region);
    placeMode?.preview.refreshSurfaceHeights(region);
  };

  const sculpt = createSculptTool(grids, input, applyTerrainHeights, WORLD.SIZE);
  const paint = createPaintBiomeTool(grids, input, (opts) => terrain.uploadBiomeMap(opts), WORLD.SIZE);

  const entityStore = new EditorEntityStore();

  const captureSnapshot = (): EditorSnapshot => ({
    height: new Float32Array(terrain.grids.height),
    biome: new Uint8Array(terrain.grids.biome),
    entities: entityStore.snapshot(),
  });

  const applySnapshot = (snap: EditorSnapshot): void => {
    const prevEntities = entityStore.getAll();
    const heightChanged = !typedGridBuffersEqual(terrain.grids.height, snap.height);
    const biomeChanged = !typedGridBuffersEqual(terrain.grids.biome, snap.biome);

    if (heightChanged) terrain.grids.height.set(snap.height);
    if (biomeChanged) terrain.grids.biome.set(snap.biome);

    entityStore.restoreSnapshot(snap.entities);

    if (heightChanged) terrain.applyHeightsToMesh();
    if (biomeChanged) terrain.uploadBiomeMap();

    placeMode.preview.reconcileEntities(prevEntities, { withHighlights: false });

    if (heightChanged) {
      placeMode.preview.refreshSurfaceHeights();
    }

    placeMode.gizmo.setSelectedUids([]);
  };

  const history = createEditorHistory({
    capture: captureSnapshot,
    apply: applySnapshot,
  });

  const dirtyTracker = createEditorDirtyTracker(captureSnapshot);

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

  const assetSidebar = initEditorAssetSidebar(assets, {
    onBrushDensity: (density) => propBrush.setOptions({ density }),
    onBrushSpacing: (spacing) => propBrush.setOptions({ spacing }),
  });

  propBrush = createPropBrushTool(
    entityStore,
    input,
    () => assetSidebar.getBrushPlaceIds(),
    {
      onEntitiesAdded: (uids) => placeMode.preview.addEntities(uids, { withHighlights: false }),
      onEntitiesRemoved: (uids) => placeMode.preview.removeEntities(uids),
    },
  );

  const biomeSidebar = initEditorBiomeSidebar({
    onBiomeChange: (biome) => paint.setOptions({ biome }),
  });

  let activeTool: EditorToolId = 'sculpt';
  let placeSubMode: PlaceSubMode = 'single';
  let lastTime = performance.now();
  let strokeBefore: EditorSnapshot | null = null;
  let wasPointerDown = false;

  const syncPlaceInteractions = (): void => {
    const singlePlace = activeTool === 'place' && placeSubMode === 'single';
    placeMode.setEnabled(singlePlace);
    assetSidebar.setPlaceSubMode(placeSubMode);
  };

  const applyEditorMode = (tool: EditorToolId): void => {
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
    }

    terrain.applyHeightsToMesh();
    placeMode.preview.refreshSurfaceHeights();
    terrain.uploadBiomeMap();
    placeMode.rebind(terrain, map);
    history.clear();
    strokeBefore = null;
    wasPointerDown = false;
    dirtyTracker.markClean();
  };

  const editorUi = initEditorUI({
    onToolChange: applyEditorMode,
    onPlaceSubModeChange: (mode) => {
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
    onRidgeStrength: (ridgeStrength) => sculpt.setOptions({ ridgeStrength }),
    onSculptMode: (mode: SculptMode) => sculpt.setOptions({ mode }),
    onRidgeFillMountains: () => {
      const before = history.beginGesture();
      const ridgeStrength = sculpt.getOptions().ridgeStrength ?? VISUAL.editor.ridgeSculpt.strength;
      fillMountainRidgeDetail(terrain.grids, ridgeStrength);
      applyTerrainHeights();
      history.commitGesture(before);
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
    mode: 'bulk',
    strength: 0.04,
    ridgeStrength: VISUAL.editor.ridgeSculpt.strength,
  });
  applyEditorMode(editorUi.getActiveTool());
  placeSubMode = editorUi.getPlaceSubMode();
  syncPlaceInteractions();
  dirtyTracker.markClean();

  const runLoop = () => {
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      editorCam.update();

      syncTerrainSplatLighting(
        terrain.splatMaterial,
        new Vector3(0, 4, 0),
        editorPlayerLight,
        sun,
        ambientLight,
        editorCam.camera,
      );

      if (activeTool === 'sculpt' || activeTool === 'paint') {
        const pointerDown = input.isPointerDown() && !input.isSpaceDown();
        if (pointerDown && !wasPointerDown) strokeBefore = history.beginGesture();
        if (activeTool === 'sculpt') sculpt.update(dt);
        else paint.update(dt);
        if (!pointerDown && wasPointerDown && strokeBefore) {
          history.commitGesture(strokeBefore);
          strokeBefore = null;
        }
        wasPointerDown = pointerDown;
      } else if (activeTool === 'place' && placeSubMode === 'brush') {
        const pointerDown = input.isPointerDown() && !input.isSpaceDown();
        if (pointerDown && !wasPointerDown) {
          strokeBefore = history.beginGesture();
          propBrush.beginStroke();
        }
        propBrush.update(dt);
        if (!pointerDown && wasPointerDown && strokeBefore) {
          propBrush.endStroke();
          history.commitGesture(strokeBefore);
          strokeBefore = null;
        }
        wasPointerDown = pointerDown;
      } else {
        wasPointerDown = false;
        strokeBefore = null;
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
        placeMode.selection.updateHover();
        placeMode.gizmo.update();
      }

      renderer.render(scene, editorCam.camera);
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
      renderer.setAnimationLoop(null);
      unbindHistoryKeys();
      history.dispose();
      placeMode.dispose();
      biomeSidebar.dispose();
      assetSidebar.dispose();
      editorUi.dispose();
      brushPreview.dispose();
      disposeMapTerrain(terrain);
    },
  };
}
