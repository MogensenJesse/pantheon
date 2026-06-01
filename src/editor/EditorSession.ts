// src/editor/EditorSession.ts — map editor runtime (tools, terrain, place mode, loop)
import { Color, PointLight, Vector3 } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import type { AssetRegistry } from '../assets/assetManifest';
import { syncTerrainSplatLighting } from '../world/terrain';
import {
  buildMapTerrain,
  disposeMapTerrain,
  type MapTerrainContext,
} from '../world/MapTerrainBuilder';
import { createEmptyMapGrids, type MapGrids } from '../map/MapGrids';
import type { MapFile } from '../map/MapTypes';
import { BiomeId } from '../map/MapTypes';
import { WORLD } from '../world/WorldConfig';
import { EditorEntityStore } from './EditorEntityStore';
import { initEditorCamera } from './EditorCamera';
import { initEditorInput } from './EditorInput';
import { initEditorAssetSidebar } from './EditorAssetSidebar';
import { initEditorBiomeSidebar } from './EditorBiomeSidebar';
import { initEditorUI, type EditorToolId } from './EditorUI';
import { createSculptTool } from './tools/SculptTool';
import { createPaintBiomeTool } from './tools/PaintBiomeTool';
import { createEditorPlaceMode } from './EditorPlaceMode';
import type { SceneContext } from '../rendering/SceneSetup';

export interface EditorSession {
  run: () => void;
  dispose: () => void;
}

export interface EditorSessionDeps {
  canvas: HTMLCanvasElement;
  setup: SceneContext;
  textures: Awaited<ReturnType<typeof import('../world/terrain').loadTerrainTextures>>;
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

  let grids = createEmptyMapGrids();
  const terrain: MapTerrainContext = buildMapTerrain(scene, textures, sun, grids, {
    receiveShadow: false,
  });

  const editorCam = initEditorCamera(canvas);
  onResize(() => {
    editorCam.camera.aspect = window.innerWidth / window.innerHeight;
    editorCam.camera.updateProjectionMatrix();
  });

  const editorPlayerLight = new PointLight(0xffffff, 0, 6);
  scene.add(editorPlayerLight);

  const input = initEditorInput(canvas, editorCam.camera, terrain.mesh, {
    isCameraNavigate: editorCam.isSpaceHeld,
  });

  const sculpt = createSculptTool(grids, input, () => terrain.applyHeightsToMesh(), WORLD.SIZE);
  const paint = createPaintBiomeTool(grids, input, () => terrain.uploadBiomeMap(), WORLD.SIZE);

  const entityStore = new EditorEntityStore();

  const placeMode = createEditorPlaceMode(
    scene,
    assets,
    terrain,
    entityStore,
    editorCam.camera,
    canvas,
    editorCam.isSpaceHeld,
    (uids) => placeMode.gizmo.setSelectedUids(uids),
  );

  const assetSidebar = initEditorAssetSidebar(assets);
  const biomeSidebar = initEditorBiomeSidebar({
    onBiomeChange: (biome) => paint.setOptions({ biome }),
  });

  let activeTool: EditorToolId = 'sculpt';
  let lastTime = performance.now();

  const applyEditorMode = (tool: EditorToolId): void => {
    activeTool = tool;
    assetSidebar.setVisible(tool === 'place');
    biomeSidebar.setVisible(tool === 'paint');
    placeMode.setEnabled(tool === 'place');
  };

  const reloadMap = (newGrids: MapGrids, map?: MapFile, persisted = false) => {
    grids = newGrids;
    terrain.grids.height.set(newGrids.height);
    terrain.grids.biome.set(newGrids.biome);

    if (map) {
      mapMeta = { id: map.id };
      mapPersisted = persisted;
    }

    terrain.applyHeightsToMesh();
    terrain.uploadBiomeMap();
    placeMode.rebind(terrain, map);
  };

  const editorUi = initEditorUI({
    onToolChange: applyEditorMode,
    onBrushRadius: (radius) => {
      sculpt.setOptions({ radius });
      paint.setOptions({ radius });
    },
    onSculptStrength: (strength) => sculpt.setOptions({ strength }),
    onMapLoaded: (map, loadedGrids, persisted = false) => reloadMap(loadedGrids, map, persisted),
    onMapSaved: (map) => {
      mapMeta = { id: map.id };
      mapPersisted = true;
    },
    getGrids: () => grids,
    getMapMeta: () => ({ ...mapMeta, persisted: mapPersisted }),
    serializeEntities: () => entityStore.serialize(),
  });

  paint.setOptions({ biome: BiomeId.Forest });
  sculpt.setOptions({ strength: 0.04 });
  applyEditorMode(editorUi.getActiveTool());

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

      if (activeTool === 'sculpt') sculpt.update(dt);
      else if (activeTool === 'paint') paint.update(dt);

      if (activeTool === 'place') {
        placeMode.selection.updateHover();
        placeMode.gizmo.update();
      }

      renderer.render(scene, editorCam.camera);
    });
  };

  return {
    run: () => {
      void (renderer as WebGPURenderer)
        .compileAsync(scene, editorCam.camera)
        .then(() => {
          if (loadingEl) loadingEl.classList.add('hidden');
          runLoop();
        });
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
      placeMode.dispose();
      biomeSidebar.dispose();
      assetSidebar.dispose();
      editorUi.dispose();
      disposeMapTerrain(terrain);
    },
  };
}
