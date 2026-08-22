// src/main.ts

import type { Texture } from 'three';
import { disposeAssetRegistry } from './assets/AssetLoader';
import type { AssetRegistry } from './assets/assetManifest';
import {
  finishPlayLoading,
  PLAY_LOADING_MSG,
  PLAY_LOADING_PROGRESS,
  runPlayAssetBatch,
} from './bootstrap/playLoadingPhases';
import { PHASE0 } from './config/phase0';
import { VISUAL } from './config/visualTuning';
import { WORLD } from './config/world';
import { type CameraInputContext, initCameraInput } from './core/CameraInput';
import { GameLoop } from './core/GameLoop';
import { devDebugSettings, state } from './core/GameState';
import { createFrameTick } from './core/gameTick';
import { disposeInputManager, initInputManager } from './core/InputManager';
import { initDayCycle } from './core/reveal/DayCycle';
import { initWorldReveal } from './core/reveal/WorldReveal';
import { initDevPanel } from './dev/panel/DevPanel';
import {
  disposePerformanceSuite,
  initPerformanceSuite,
  setPerformanceGrassSource,
} from './dev/profiling';
import { countVisibleOrbs } from './entities/EnergyOrb';
import { orbHoverBaseY } from './entities/orbFloat';
import { sampleOrbTerrainFooting } from './entities/orbTerrainFooting';
import { initPlayerController } from './entities/PlayerController';
import { getPlayerStartFromMap, type MapFile } from './map/MapTypes';
import { isMapGrassEnabled } from './map/mapGrassSettings';
import { hasPlayMapId, loadPlayMapFile } from './map/play/playMapSelection';
import { PlayMapValidationError } from './map/play/validatePlayMap';
import { initCameraRig } from './rendering/CameraRig';
import { initMeshCloudSystem } from './rendering/clouds/MeshCloudSystem';
import { logRenderDebugFrame } from './rendering/debug/renderDebugLog';
import {
  disposeShadowDebug,
  logShadowDebugInit,
  type ShadowDebugInput,
} from './rendering/debug/shadowDebugLog';
import { ensureSceneGeometryUv } from './rendering/ensureGeometryUv';
import { disposePostFX, initPostFX } from './rendering/PostFX';
import { applyGradeLutToPostFX } from './rendering/postfx/applyGradeLut';
import { createSunHorizonTracker } from './rendering/postfx/sunHorizonOcclusion';
import { disposeSceneSetup, initSceneSetup, type SceneContext } from './rendering/SceneSetup';
import type { NightHdriAssets } from './rendering/sky/hdri/loadNightHdri';
import { initSkySystem } from './rendering/sky/SkySystem';
import type { SunShadowDebugTargets } from './rendering/sunShadow';
import {
  installShadowCastSceneHooks,
  warmupCloudCastShadowMap,
  warmupNearCascadeShadowMap,
  warmupSunShadowMap,
} from './rendering/sunShadow';
import { checkWebGPUSupport, getWebGPUErrorMessage } from './rendering/webgpuCapability';
import { syncWorldLighting } from './rendering/worldLighting';
import { initHUD } from './ui/HUD';
import { ensurePlayMapSelected } from './ui/MapSelectScreen';
import { initPlayLoadingScreen } from './ui/PlayLoadingScreen';
import { initStoryLog } from './ui/StoryLog';
import { grassSharedUniforms } from './world/grass/config/grassUniforms';
import { type GrassSystem, initGrassSystem } from './world/grass/core/GrassSystem';
import { disposeWorldTerrain } from './world/MapTerrainBuilder';
import { propShadowUniforms } from './world/mapProps/config/mapPropShadowUniforms';
import {
  applyTerrainDevUniforms,
  createTerrainLodBoundsDebug,
  initTerrainAtlases,
  type TerrainLodBoundsDebug,
  type TerrainTextureSet,
} from './world/terrain';
import { buildWorld } from './world/WorldBuilder';
import { waterShadowUniforms } from './world/water/material/waterShadowUniforms';
import type { PantheonWaterInstance } from './world/water/mesh/pantheonWaterTypes';

let tornDown = false;
let cameraInput: CameraInputContext | null = null;
function disposeSession(): void {
  if (tornDown) return;
  tornDown = true;
  GameLoop.stop();
  cameraInput?.dispose();
  cameraInput = null;
  disposeInputManager();
  if (import.meta.env.DEV) {
    disposeShadowDebug();
    disposePerformanceSuite();
  }
  disposeSceneSetup();
  disposePostFX();
}

async function main(): Promise<void> {
  if (!(await checkWebGPUSupport())) {
    document.body.appendChild(getWebGPUErrorMessage());
    throw new Error('WebGPU not supported');
  }

  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #game canvas element');
  }

  const loading = initPlayLoadingScreen();
  loading.setMessage(PLAY_LOADING_MSG.renderer);
  loading.setProgress(PLAY_LOADING_PROGRESS.renderer);
  initInputManager();

  let renderer: SceneContext['renderer'];
  let scene: SceneContext['scene'];
  let camera: SceneContext['camera'];
  let ambientLight: SceneContext['ambientLight'];
  let sun: SceneContext['sun'];

  try {
    ({ renderer, scene, camera, ambientLight, sun } = await initSceneSetup(canvas));
    if (import.meta.env.DEV) initPerformanceSuite(renderer);
  } catch (err) {
    console.error('WebGPURenderer init failed:', err);
    document.body.appendChild(getWebGPUErrorMessage());
    throw err;
  }

  const postFX = initPostFX(renderer, scene, camera, sun);
  const buildPostFxDebugTargets = import.meta.env.DEV
    ? (await import('./dev/runtime/postFxDebugTargets')).buildPostFxDebugTargets
    : null;

  const gradeLut = VISUAL.postfx.grade.lut;
  const gradeLutReady =
    gradeLut.enabled && gradeLut.path
      ? applyGradeLutToPostFX(postFX, gradeLut.path, gradeLut.size).catch((err) => {
          console.warn('[grade] Failed to load LUT:', gradeLut.path, err);
        })
      : Promise.resolve();

  if (!hasPlayMapId()) {
    loading.hide();
    await ensurePlayMapSelected();
    loading.show();
  }

  let playMap: MapFile;
  loading.setMessage(PLAY_LOADING_MSG.map);
  loading.setProgress(PLAY_LOADING_PROGRESS.map);
  try {
    playMap = await loadPlayMapFile();
  } catch (err) {
    const message =
      err instanceof PlayMapValidationError || err instanceof Error
        ? err.message
        : 'Failed to load map.';
    console.error('[maps]', err);
    loading.showError(message);
    return;
  }

  const playerStart = getPlayerStartFromMap(playMap);
  const { x: startX, z: startZ } = playerStart;
  const startYawRad = playerStart.rotY ?? PHASE0.CAMERA.INITIAL_YAW;

  let assets: AssetRegistry;
  let terrainTextures: TerrainTextureSet;
  let waterNormals: Texture;
  let nightHdri: NightHdriAssets | null;
  try {
    ({ assets, terrainTextures, waterNormals, nightHdri } = await runPlayAssetBatch(
      loading,
      renderer,
    ));
  } catch (err) {
    console.error('Asset loading failed:', err);
    loading.showError('Failed to load world assets.');
    return;
  }

  loading.setMessage(PLAY_LOADING_MSG.stitch);
  loading.setProgress(PLAY_LOADING_PROGRESS.stitch);
  initTerrainAtlases(renderer, terrainTextures.atlases);

  const skySystem = initSkySystem(scene, nightHdri);
  const cloudSystem = initMeshCloudSystem(scene, sun);

  loading.setMessage(PLAY_LOADING_MSG.rocks);
  loading.setProgress(PLAY_LOADING_PROGRESS.rocks);
  const world = await buildWorld(scene, assets, terrainTextures, sun, waterNormals, {
    map: playMap,
  });
  const { terrain, debugInstancedMeshes, propLodGroups, orbSystem, guideLine, disposeMapEntities } =
    world;
  cloudSystem?.bindTerrainHeight({
    heightMap: terrain.heightMap,
    worldSize: WORLD.SIZE,
    heightScale: WORLD.HEIGHT_SCALE,
    getWorldY: terrain.getWorldY,
  });

  const origUploadBiomeMap = terrain.uploadBiomeMap.bind(terrain);
  const startFooting = sampleOrbTerrainFooting(terrain, startX, startZ, PHASE0.ORB.PLAYER_RADIUS);
  const startCameraY = orbHoverBaseY(
    startFooting.surfaceY,
    PHASE0.ORB.PLAYER_RADIUS,
    startFooting.normalY,
  );
  const waterMesh: PantheonWaterInstance | null =
    'isWaterMesh' in terrain.water ? (terrain.water as PantheonWaterInstance) : null;
  const playWaterY = WORLD.BIOMES.WATER.max * WORLD.HEIGHT_SCALE;

  cameraInput = initCameraInput(canvas, startYawRad);
  const cameraRig = initCameraRig(camera, startX, startZ, startCameraY, startYawRad);
  if (import.meta.env.DEV) {
    const terrainMaterials = terrain.macroSplatMaterial
      ? [terrain.splatMaterial, terrain.macroSplatMaterial]
      : terrain.splatMaterial;
    applyTerrainDevUniforms(terrainMaterials, true);
  }

  const player = initPlayerController(scene, terrain, startX, startZ);
  terrain.updateLod(startX, startZ);
  let lodBoundsDebug: TerrainLodBoundsDebug | undefined;
  if (import.meta.env.DEV && terrain.lodEnabled) {
    lodBoundsDebug = createTerrainLodBoundsDebug(scene, VISUAL.terrain.meshSegments);
  }
  const lightingOpts = {
    terrainMaterial: terrain.splatMaterial,
    terrainMacroMaterial: terrain.macroSplatMaterial,
    playerPosition: player.position,
    playerLight: player.playerLight,
    sun,
    ambientLight,
    camera,
  };
  syncWorldLighting({ ...lightingOpts, daylight: skySystem.getDaylight() });

  let refreshDebugTargets: () => void = () => {};
  let grassSystem: GrassSystem | undefined;
  const sunShadowDebugTargets: SunShadowDebugTargets = {
    terrain: terrain.splatMaterial.terrainUniforms.uShadowFloor,
    terrainMacro: terrain.macroSplatMaterial?.terrainUniforms.uShadowFloor,
    grass: grassSharedUniforms.uShadowFloor,
    props: propShadowUniforms.uShadowFloor,
    water: waterShadowUniforms.uShadowFloor,
  };
  refreshDebugTargets = buildPostFxDebugTargets
    ? () => {
        postFX.setDebugTargets(
          buildPostFxDebugTargets({
            scene,
            terrainMesh: terrain.mesh,
            terrainMaterial: terrain.splatMaterial,
            water: terrain.water,
            sky: skySystem.sky,
            cloudSystem,
            mapPropMeshes: debugInstancedMeshes,
            grassMesh: grassSystem?.mesh,
            sun,
            sunShadowDebugTargets,
          }),
        );
      }
    : () => {};

  if (isMapGrassEnabled(playMap.grass)) {
    loading.setMessage(PLAY_LOADING_MSG.grass);
    loading.setProgress(PLAY_LOADING_PROGRESS.grass);
    grassSystem = await initGrassSystem(scene, renderer, terrain, {
      sun,
      mapGrass: playMap.grass,
      mapEntities: playMap.entities ?? [],
      assets,
      onMeshReplaced: refreshDebugTargets,
    });
    world.grassSystem = grassSystem;
    if (import.meta.env.DEV) setPerformanceGrassSource(grassSystem);
    terrain.uploadBiomeMap = () => {
      origUploadBiomeMap();
      grassSystem!.onTerrainMapsUpdated();
    };
  } else {
    terrain.uploadBiomeMap = origUploadBiomeMap;
  }

  refreshDebugTargets();
  ensureSceneGeometryUv(scene);
  installShadowCastSceneHooks(scene);
  loading.setMessage(PLAY_LOADING_MSG.light);
  loading.setProgress(PLAY_LOADING_PROGRESS.light);
  warmupSunShadowMap(renderer, scene, sun, camera, startX, startZ);
  warmupNearCascadeShadowMap(renderer, scene, camera, startX, startZ);
  warmupCloudCastShadowMap(renderer, scene, camera, startX, startZ);
  await renderer.compileAsync(scene, camera);

  loading.setMessage(PLAY_LOADING_MSG.shaders);
  loading.setProgress(PLAY_LOADING_PROGRESS.shaders);
  await gradeLutReady;
  postFX.warmupEffectGraphs();

  const shadowDebugInput: ShadowDebugInput = {
    renderer,
    scene,
    sun,
    terrainMaterial: terrain.splatMaterial,
    terrainReceiveShadow: terrain.playTerrainLod
      ? terrain.playTerrainLod.detailMesh.receiveShadow
      : (terrain.mesh as import('three').Mesh).receiveShadow,
    terrainCastShadow: terrain.shadowCastMesh?.castShadow ?? false,
    mapPropMeshes: debugInstancedMeshes,
    disableShadowsDev: devDebugSettings.renderDebug.disableShadows,
    sunShadowDebugTargets,
    energy: state.energy,
    energyCap: state.energyCap,
  };
  if (import.meta.env.DEV) {
    logShadowDebugInit(shadowDebugInput);
  }

  await finishPlayLoading(loading);
  const cameraHint = document.getElementById('camera-hint');
  if (cameraHint) cameraHint.classList.add('visible');

  const worldReveal = initWorldReveal(postFX, ambientLight, sun, skySystem);
  const dayCycle = initDayCycle(sun, ambientLight, skySystem);
  const sunHorizonTracker = createSunHorizonTracker();
  const unsubHUD = initHUD();
  const unsubStoryLog = initStoryLog();

  const frameTick = createFrameTick({
    renderer,
    player,
    cameraRig,
    cameraInput,
    orbSystem,
    guideLine,
    terrain,
    camera,
    sun,
    postFX,
    skySystem,
    cloudSystem,
    dayCycle,
    sunHorizonTracker,
    grassSystem,
    lodBoundsDebug,
    lightingOpts,
    waterMesh,
    playWaterY,
    shadowDebugInput,
    propLodGroups,
  });

  const logRenderDebugNow = import.meta.env.DEV
    ? () => {
        logRenderDebugFrame({
          camera,
          sun,
          elapsed: frameTick.getElapsed(),
          energy: state.energy,
          energyCap: state.energyCap,
          orbCount: orbSystem.orbs.length,
          orbVisibleCount: countVisibleOrbs(orbSystem.orbs),
        });
      }
    : undefined;

  const unsubDevPanel = initDevPanel(
    postFX,
    {
      hasDisplacementMaps: terrainTextures.hasDisplacementMaps,
      lodEnabled: terrain.lodEnabled,
      lodVertexStats: terrain.lodVertexStats,
      grass: grassSystem,
    },
    logRenderDebugNow,
    { sky: skySystem, sun, ambientLight, cloudSystem },
    {
      sun,
      sunShadowDebugTargets,
      terrainMaterial: terrain.splatMaterial,
    },
    { propLodGroups },
  );

  const runTeardown = () => {
    unsubHUD();
    unsubStoryLog();
    unsubDevPanel();
    worldReveal.dispose();
    dayCycle.dispose();
    skySystem.dispose();
    cloudSystem?.dispose();
    disposeMapEntities();
    grassSystem?.dispose();
    lodBoundsDebug?.dispose();
    orbSystem.dispose();
    guideLine.dispose();
    player.dispose();
    disposeWorldTerrain(terrain);
    terrainTextures.dispose();
    waterNormals.dispose();
    disposeAssetRegistry(assets);
    disposeSession();
  };

  window.addEventListener('pagehide', runTeardown);

  GameLoop.start(frameTick.fixedUpdate, frameTick.render, renderer);
}

main().catch(console.error);
