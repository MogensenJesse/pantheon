// src/main.ts

import type { Texture } from 'three';
import { disposeAssetRegistry } from './assets/AssetLoader';
import type { AssetRegistry } from './assets/assetManifest';
import { PHASE0 } from './config/phase0';
import { VISUAL } from './config/visualTuning';
import { type CameraInputContext, initCameraInput } from './core/CameraInput';
import { GameLoop } from './core/GameLoop';
import { devSettings, state } from './core/GameState';
import { disposeInputManager, initInputManager } from './core/InputManager';
import { initDayCycle } from './core/reveal/DayCycle';
import { initWorldReveal, isSunRevealDone } from './core/reveal/WorldReveal';
import { buildPostFxDebugTargets } from './dev/postFxDebugTargets';
import { countVisibleOrbs } from './entities/EnergyOrb';
import { orbHoverBaseY } from './entities/orbFloat';
import { initPlayerController } from './entities/PlayerController';
import { getPlayerStartFromMap, type MapFile } from './map/MapTypes';
import { isMapGrassEnabled } from './map/mapGrassSettings';
import { hasPlayMapId, loadPlayMapFile } from './map/playMapSelection';
import { PlayMapValidationError } from './map/validatePlayMap';
import { setValleyFogFromSun } from './rendering/atmosphere/valleyFog';
import { initCameraRig } from './rendering/CameraRig';
import { logRenderDebugFrame } from './rendering/debug/renderDebugLog';
import {
  disposeShadowDebug,
  logShadowDebugInit,
  type ShadowDebugInput,
} from './rendering/debug/shadowDebugLog';
import { ensureSceneGeometryUv } from './rendering/ensureGeometryUv';
import { disposePostFX, initPostFX } from './rendering/PostFX';
import { dofBokehScaleFromReveal } from './rendering/postfx/dofReveal';
import { syncColorPipeline } from './rendering/postfx/syncColorPipeline';
import { applyGradeLutToPostFX } from './rendering/postfx/applyGradeLut';
import { createSunHorizonTracker } from './rendering/postfx/sunHorizonOcclusion';
import {
  disposeSceneSetup,
  initSceneSetup,
  type SceneContext,
  updateSunShadowTarget,
  warmupSunShadowMap,
} from './rendering/SceneSetup';
import { installShadowCastSceneHooks } from './rendering/shadowCastConfig';
import type { NightHdriAssets } from './rendering/sky/hdri/loadNightHdri';
import { nightHdriWeightForGameState } from './rendering/sky/hdri/nightHdriBlend';
import { playerIlluminationRatio } from './rendering/sky/lightingCurves';
import { initSkySystem } from './rendering/sky/SkySystem';
import { createSunShadowDebugTargets } from './rendering/sunShadow';
import { currentSunAzimuthDeg, currentSunElevationDeg } from './rendering/sunSpherical';
import { checkWebGPUSupport, getWebGPUErrorMessage } from './rendering/webgpuCapability';
import { syncWorldLighting } from './rendering/worldLighting';
import { initDevPanel } from './ui/DevPanel';
import { tickBloomPanelSync } from './ui/dev/devPanelBloom';
import { tickDayCyclePanelSync } from './ui/dev/sky/devPanelDayCycle';
import { disposeFpsCounter, fpsCounterBegin, fpsCounterEnd } from './ui/FpsCounter';
import { initHUD } from './ui/HUD';
import { ensurePlayMapSelected } from './ui/MapSelectScreen';
import { initPlayLoadingScreen } from './ui/PlayLoadingScreen';
import {
  finishPlayLoading,
  PLAY_LOADING_MSG,
  PLAY_LOADING_PROGRESS,
  runPlayAssetBatch,
} from './ui/playLoadingPhases';
import { initStoryLog } from './ui/StoryLog';
import { disposeWorldTerrain } from './world/disposeWorldTerrain';
import { grassSharedUniforms } from './world/grass/config/grassUniforms';
import { type GrassSystem, initGrassSystem } from './world/grass/core/GrassSystem';
import { propShadowUniforms } from './world/mapProps/mapPropShadowUniforms';
import {
  applyTerrainDevUniforms,
  createTerrainLodBoundsDebug,
  initTerrainAtlases,
  type TerrainLodBoundsDebug,
  type TerrainTextureSet,
} from './world/terrain';
import { buildWorld } from './world/WorldBuilder';
import { WORLD } from './world/WorldConfig';
import type { PantheonWaterInstance } from './world/water/pantheonWaterTypes';
import { syncPantheonWater } from './world/water/syncPantheonWater';
import { updateWaterReflectionQuality } from './world/water/updateWaterReflectionQuality';
import { waterShadowUniforms } from './world/water/waterShadowUniforms';

let tornDown = false;
let cameraInput: CameraInputContext | null = null;
function disposeSession(): void {
  if (tornDown) return;
  tornDown = true;
  GameLoop.stop();
  cameraInput?.dispose();
  cameraInput = null;
  disposeInputManager();
  disposeSceneSetup();
  disposePostFX();
  disposeFpsCounter();
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
  } catch (err) {
    console.error('WebGPURenderer init failed:', err);
    document.body.appendChild(getWebGPUErrorMessage());
    throw err;
  }

  const postFX = initPostFX(renderer, scene, camera, sun);

  const gradeLut = VISUAL.postfx.grade.lut;
  if (gradeLut.enabled && gradeLut.path) {
    void applyGradeLutToPostFX(postFX, gradeLut.path, gradeLut.size).catch((err) => {
      console.warn('[grade] Failed to load LUT:', gradeLut.path, err);
    });
  }

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

  const [startX, startZ] = getPlayerStartFromMap(playMap);

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

  loading.setMessage(PLAY_LOADING_MSG.rocks);
  loading.setProgress(PLAY_LOADING_PROGRESS.rocks);
  const world = await buildWorld(scene, assets, terrainTextures, sun, waterNormals, {
    map: playMap,
  });
  const { terrain, debugInstancedMeshes, orbSystem, disposeMapEntities } = world;

  const origUploadBiomeMap = terrain.uploadBiomeMap.bind(terrain);
  const startTerrainY = terrain.getWorldY(startX, startZ);
  const startCameraY = orbHoverBaseY(startTerrainY, PHASE0.ORB.PLAYER_RADIUS);
  const waterMesh: PantheonWaterInstance | null =
    'isWaterMesh' in terrain.water ? (terrain.water as PantheonWaterInstance) : null;
  const playWaterY = WORLD.BIOMES.WATER.max * WORLD.HEIGHT_SCALE;

  cameraInput = initCameraInput(canvas);
  const cameraRig = initCameraRig(camera, startX, startZ, startCameraY);
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
  const sunShadowDebugTargets = createSunShadowDebugTargets({
    terrain: terrain.splatMaterial.terrainUniforms.uShadowFloor,
    terrainMacro: terrain.macroSplatMaterial?.terrainUniforms.uShadowFloor,
    grass: grassSharedUniforms.uShadowFloor,
    props: propShadowUniforms.uShadowFloor,
    water: waterShadowUniforms.uShadowFloor,
  });
  refreshDebugTargets = import.meta.env.DEV
    ? () => {
        postFX.setDebugTargets(
          buildPostFxDebugTargets({
            scene,
            terrainMesh: terrain.mesh,
            terrainMaterial: terrain.splatMaterial,
            water: terrain.water,
            sky: skySystem.sky,
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
      onMeshReplaced: refreshDebugTargets,
    });
    world.grassSystem = grassSystem;
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
  await renderer.compileAsync(scene, camera);

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
    disableShadowsDev: devSettings.renderDebug.disableShadows,
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

  const logRenderDebugNow = import.meta.env.DEV
    ? () => {
        logRenderDebugFrame({
          camera,
          sun,
          elapsed,
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
      terrainMaterial: terrain.splatMaterial,
      hasDisplacementMaps: terrainTextures.hasDisplacementMaps,
      lodEnabled: terrain.lodEnabled,
      lodVertexStats: terrain.lodVertexStats,
      grass: grassSystem,
    },
    logRenderDebugNow,
    { sky: skySystem, sun, ambientLight },
    {
      renderer,
      sun,
      sunShadowDebugTargets,
      terrainMaterial: terrain.splatMaterial,
    },
  );

  let elapsed = 0;

  const runTeardown = () => {
    if (import.meta.env.DEV) {
      disposeShadowDebug();
    }
    unsubHUD();
    unsubStoryLog();
    unsubDevPanel();
    worldReveal.dispose();
    dayCycle.dispose();
    skySystem.dispose();
    disposeMapEntities();
    grassSystem?.dispose();
    lodBoundsDebug?.dispose();
    orbSystem.dispose();
    player.dispose();
    disposeWorldTerrain(terrain);
    terrainTextures.dispose();
    waterNormals.dispose();
    disposeAssetRegistry(assets);
    disposeSession();
  };

  window.addEventListener('pagehide', runTeardown);

  GameLoop.start(
    (dt) => {
      elapsed += dt;
      player.update(dt, cameraRig.getMovementAxes());
      orbSystem.update(player.position, dt);
    },
    async (_alpha, frameDelta) => {
      worldReveal.update(frameDelta);
      dayCycle.update(frameDelta);
      const sunElevationDeg = currentSunElevationDeg();
      const energyRatio =
        state.energyCap > 0 ? Math.min(1, Math.max(0, state.energy / state.energyCap)) : 0;
      player.updateIllumination(playerIlluminationRatio(energyRatio, sunElevationDeg), frameDelta);
      syncWorldLighting({ ...lightingOpts, daylight: skySystem.getDaylight() });

      grassSystem?.update({
        playerPosition: player.position,
        playerRadius: PHASE0.ORB.PLAYER_RADIUS,
        camera,
        elapsed,
        daylight: skySystem.getDaylight(),
        playerLightDistance: player.playerLight.distance,
        playerLightIntensity: player.playerLight.intensity,
      });
      if (
        import.meta.env.DEV &&
        grassSystem &&
        devSettings.grass.enabled !== grassSystem.mesh.visible
      ) {
        grassSystem.mesh.visible = devSettings.grass.enabled;
      }

      if (import.meta.env.DEV && devSettings.terrain.dirty) {
        const terrainMaterials = terrain.macroSplatMaterial
          ? [terrain.splatMaterial, terrain.macroSplatMaterial]
          : terrain.splatMaterial;
        applyTerrainDevUniforms(terrainMaterials);
      }

      cameraRig.update(
        player.cameraAnchor,
        frameDelta,
        cameraInput!.getYaw(),
        cameraInput!.getPitch(),
      );
      terrain.updateLod(player.position.x, player.position.z);
      if (lodBoundsDebug) {
        lodBoundsDebug.update(
          player.position.x,
          player.position.z,
          terrain.getWorldY(player.position.x, player.position.z),
          devSettings.terrain.showLodBounds,
        );
      }
      updateSunShadowTarget(player.position.x, player.position.z, sun, sunElevationDeg);
      const hdriWeight = nightHdriWeightForGameState();
      skySystem.setNightHdriWeight(hdriWeight);
      if (import.meta.env.DEV) {
        const h = devSettings.godraysHorizon;
        sunHorizonTracker.setConfig({
          maxDistanceM: h.maxDistanceM,
          sampleCount: h.sampleCount,
          rayFanCount: h.rayFanCount,
          rayFanSpreadDeg: h.rayFanSpreadDeg,
          smoothRatePerSec: h.smoothRatePerSec,
        });
      }
      const horizonOcclusionEnabled = !import.meta.env.DEV || devSettings.godraysHorizon.enabled;
      const sunHorizonElevationDeg = horizonOcclusionEnabled
        ? sunHorizonTracker.update(
            camera.position.x,
            camera.position.z,
            camera.position.y,
            currentSunAzimuthDeg(),
            terrain.getWorldY,
            frameDelta,
          )
        : 0;
      syncColorPipeline(skySystem, postFX, {
        elevationDeg: sunElevationDeg,
        sunIntensity: sun.intensity,
        vignetteEnergyRatio: energyRatio,
        revealActive: !isSunRevealDone(),
        sunHorizonElevationDeg,
      });
      skySystem.update(sun, camera, elapsed);
      if (waterMesh) {
        updateWaterReflectionQuality(
          waterMesh,
          player.position,
          cameraInput!.getPitch(),
          frameDelta,
          terrain.getWorldY,
          playWaterY,
        );
        syncPantheonWater(
          waterMesh,
          sunElevationDeg,
          skySystem.getDaylight(),
          currentSunAzimuthDeg(),
        );
      }
      setValleyFogFromSun(sunElevationDeg, skySystem.getDaylight(), hdriWeight);
      postFX.setDofFocus(camera, player.cameraAnchor, frameDelta);
      postFX.setDofBokehScale(dofBokehScaleFromReveal(energyRatio));

      if (import.meta.env.DEV) {
        shadowDebugInput.disableShadowsDev = devSettings.renderDebug.disableShadows;
        tickDayCyclePanelSync();
        tickBloomPanelSync();
      }

      await grassSystem?.whenComputeReady();

      fpsCounterBegin();
      postFX.render();
      fpsCounterEnd();
    },
  );
}

main().catch(console.error);
