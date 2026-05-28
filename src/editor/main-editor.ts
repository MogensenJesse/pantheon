// src/editor/main-editor.ts — DEV-only map editor bootstrap

import { Color, PointLight, Vector3 } from 'three';

import { loadAllAssets } from '../assets/AssetLoader';

import { initSceneSetup, disposeSceneSetup } from '../rendering/SceneSetup';

import { checkWebGPUSupport, getWebGPUErrorMessage } from '../rendering/webgpuCapability';

import { loadTerrainTextures } from '../world/terrain';

import { syncTerrainSplatLighting } from '../world/terrain';

import { buildMapTerrain, disposeMapTerrain, type MapTerrainContext } from '../world/MapTerrainBuilder';

import { bakeProceduralMapGrids } from '../map/MapGrids';

import { getMapEntities } from '../map/MapIO';

import type { MapFile } from '../map/MapTypes';

import { BiomeId } from '../map/MapTypes';

import { WORLD } from '../world/WorldConfig';

import { EditorEntityStore } from './EditorEntityStore';

import { createMapEntityPreview } from './MapEntityPreview';

import { initEditorCamera } from './EditorCamera';

import { initEditorInput } from './EditorInput';

import { initEditorAssetSidebar } from './EditorAssetSidebar';
import { initEditorBiomeSidebar } from './EditorBiomeSidebar';
import { disposeAssetThumbnails } from './EditorAssetThumbnails';
import { initEditorUI, type EditorToolId } from './EditorUI';

import { createSculptTool } from './tools/SculptTool';
import { createPaintBiomeTool } from './tools/PaintBiomeTool';
import { initEditorDragDrop } from './EditorDragDrop';
import { createEntitySelectionController } from './EntitySelectionController';
import { createEntityTransformGizmo } from './EntityTransformGizmo';

if (!import.meta.env.DEV) {
  document.body.innerHTML =
    '<p style="color:#c8bfb0;font-family:Georgia,serif;padding:2em">Map editor is only available in development builds.</p>';
  throw new Error('Editor requires DEV mode');
}

let mapMeta = { id: 'aethon-default', name: 'Aethon Default' };

let terrain: MapTerrainContext | null = null;
let assetSidebar: ReturnType<typeof initEditorAssetSidebar> | null = null;
let biomeSidebar: ReturnType<typeof initEditorBiomeSidebar> | null = null;
let entitySelection: ReturnType<typeof createEntitySelectionController> | null = null;
let transformGizmo: ReturnType<typeof createEntityTransformGizmo> | null = null;
let dragDrop: ReturnType<typeof initEditorDragDrop> | null = null;

let activeTool: EditorToolId = 'sculpt';

let lastTime = performance.now();

const entityStore = new EditorEntityStore();

function applyEditorMode(tool: EditorToolId): void {
  activeTool = tool;
  assetSidebar?.setVisible(tool === 'place');
  biomeSidebar?.setVisible(tool === 'paint');
  entitySelection?.setEnabled(tool === 'place');
  dragDrop?.setEnabled(tool === 'place');
  transformGizmo?.setEnabled(tool === 'place');
  if (tool !== 'place') {
    transformGizmo?.setSelectedUids([]);
  }
}

async function main(): Promise<void> {
  if (!(await checkWebGPUSupport())) {
    document.body.appendChild(getWebGPUErrorMessage());
    throw new Error('WebGPU not supported');
  }

  const canvas = document.getElementById('editor');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #editor canvas');
  }

  const loadingEl = document.getElementById('loading');

  const { renderer, scene, sun, ambientLight, onResize } = await initSceneSetup(canvas);

  scene.background = new Color(0x3a4550);

  sun.intensity = 1.1;
  sun.castShadow = false;

  const fixedSunDir = new Vector3(0.55, 0.75, 0.45).normalize();
  sun.position.copy(fixedSunDir).multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  const [textures, assets] = await Promise.all([loadTerrainTextures(), loadAllAssets()]);

  let grids = bakeProceduralMapGrids();
  terrain = buildMapTerrain(scene, textures, sun, grids, { receiveShadow: false });

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

  const sculpt = createSculptTool(grids, input, () => terrain?.applyHeightsToMesh(), WORLD.SIZE);
  const paint = createPaintBiomeTool(grids, input, () => terrain?.uploadBiomeMap(), WORLD.SIZE);

  let entityPreview = createMapEntityPreview(scene, assets, terrain, entityStore);
  entityPreview.sync();

  const onEntitiesChanged = () => {
    entityPreview.sync();
    transformGizmo?.update();
  };

  const onSelectionChange = (uids: readonly string[]) => {
    transformGizmo?.setSelectedUids(uids);
  };

  transformGizmo = createEntityTransformGizmo(
    scene,
    editorCam.camera,
    canvas,
    terrain.mesh,
    entityStore,
    () => entityPreview,
    { onChanged: onEntitiesChanged },
  );

  entitySelection = createEntitySelectionController(
    entityStore,
    () => entityPreview,
    editorCam.camera,
    canvas,
    editorCam.isSpaceHeld,
    {
      onSelectionChange,
      onChanged: onEntitiesChanged,
    },
  );

  dragDrop = initEditorDragDrop(
    canvas,
    editorCam.camera,
    terrain.mesh,
    entityStore,
    onEntitiesChanged,
  );

  assetSidebar = initEditorAssetSidebar(assets);
  biomeSidebar = initEditorBiomeSidebar({
    onBiomeChange: (biome) => paint.setOptions({ biome }),
  });

  const reloadTerrain = (newGrids: typeof grids, map?: MapFile) => {
    if (!terrain) return;

    grids = newGrids;
    terrain.grids.height.set(newGrids.height);
    terrain.grids.biome.set(newGrids.biome);

    if (map) {
      mapMeta = { id: map.id, name: map.name };
      entityStore.loadFromMapEntities(getMapEntities(map));
    }

    terrain.applyHeightsToMesh();
    terrain.uploadBiomeMap();

    entityPreview.dispose();
    entityPreview = createMapEntityPreview(scene, assets, terrain, entityStore);
    entityPreview.sync();

    transformGizmo?.dispose();
    transformGizmo = createEntityTransformGizmo(
      scene,
      editorCam.camera,
      canvas,
      terrain.mesh,
      entityStore,
      () => entityPreview,
      { onChanged: onEntitiesChanged },
    );

    entitySelection?.dispose();
    entitySelection = createEntitySelectionController(
      entityStore,
      () => entityPreview,
      editorCam.camera,
      canvas,
      editorCam.isSpaceHeld,
      {
        onSelectionChange,
        onChanged: onEntitiesChanged,
      },
    );

    applyEditorMode(activeTool);
  };

  const editorUi = initEditorUI({
    onToolChange: applyEditorMode,
    onBrushRadius: (radius) => {
      sculpt.setOptions({ radius });
      paint.setOptions({ radius });
    },
    onSculptStrength: (strength) => sculpt.setOptions({ strength }),
    onMapLoaded: (map, loadedGrids) => reloadTerrain(loadedGrids, map),
    onMapSaved: (map) => {
      mapMeta = { id: map.id, name: map.name };
    },
    getGrids: () => grids,
    getMapMeta: () => mapMeta,
    serializeEntities: () => entityStore.serialize(),
  });

  paint.setOptions({ biome: BiomeId.Forest });
  sculpt.setOptions({ strength: 0.04 });
  applyEditorMode(editorUi.getActiveTool());

  await renderer.compileAsync(scene, editorCam.camera);

  if (loadingEl) loadingEl.classList.add('hidden');

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    editorCam.update();

    if (terrain) {
      syncTerrainSplatLighting(
        terrain.splatMaterial,
        new Vector3(0, 4, 0),
        editorPlayerLight,
        sun,
        ambientLight,
        editorCam.camera,
      );
    }

    if (activeTool === 'sculpt') sculpt.update(dt);
    else if (activeTool === 'paint') paint.update();

    if (activeTool === 'place') {
      entitySelection!.updateHover();
      transformGizmo!.update();
    }

    renderer.render(scene, editorCam.camera);
  });
}

main().catch((err) => {
  console.error(err);
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.textContent = 'Editor failed to start — see console.';
    loadingEl.classList.remove('hidden');
  }
});

window.addEventListener('beforeunload', () => {
  if (terrain) disposeMapTerrain(terrain);
  dragDrop?.dispose();
  transformGizmo?.dispose();
  entitySelection?.dispose();
  biomeSidebar?.dispose();
  assetSidebar?.dispose();
  disposeAssetThumbnails();
  disposeSceneSetup();
});
