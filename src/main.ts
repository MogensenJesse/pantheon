// src/main.ts

import type { Texture } from 'three';
import { disposeAssetRegistry, loadAllAssets } from './assets/AssetLoader';
import type { AssetRegistry } from './assets/assetManifest';
import { PHASE0 } from './config/phase0';
import { type CameraInputContext, initCameraInput } from './core/CameraInput';
import { bus } from './core/EventBus';
import { GameLoop } from './core/GameLoop';
import { devSettings, state } from './core/GameState';
import { disposeInputManager, initInputManager } from './core/InputManager';
import { initDayCycle } from './core/reveal/DayCycle';
import { initWorldReveal } from './core/reveal/WorldReveal';
import { buildPostFxDebugTargets } from './dev/postFxDebugTargets';
import { countVisibleOrbs } from './entities/EnergyOrb';
import { orbHoverBaseY } from './entities/orbFloat';
import { initPlayerController } from './entities/PlayerController';
import { getPlayerStartFromMap, type MapFile } from './map/MapTypes';
import { isMapGrassEnabled } from './map/mapGrassSettings';
import { hasPlayMapId, loadPlayMapFile } from './map/playMapSelection';
import { PlayMapValidationError } from './map/validatePlayMap';
import { initCameraRig } from './rendering/CameraRig';
import { logRenderDebugFrame, logRenderDebugInit } from './rendering/debug/renderDebugLog';
import {
  disposeShadowDebug,
  logShadowDebug,
  logShadowDebugInit,
  type ShadowDebugInput,
} from './rendering/debug/shadowDebugLog';
import { ensureSceneGeometryUv } from './rendering/ensureGeometryUv';
import { loadCloudTexture } from './rendering/loaders/loadCloudTexture';
import { disposePostFX, initPostFX } from './rendering/PostFX';
import { dofBokehScaleFromReveal } from './rendering/postfx/dofReveal';
import { installShadowCastSceneHooks } from './rendering/shadowCastConfig';
import {
  disposeSceneSetup,
  initSceneSetup,
  type SceneContext,
  updateSunShadowTarget,
  warmupSunShadowMap,
} from './rendering/SceneSetup';
import { loadNightHdri, type NightHdriAssets } from './rendering/sky/hdri/loadNightHdri';
import { nightHdriWeightForGameState } from './rendering/sky/hdri/nightHdriBlend';
import { logNightHdriFrame } from './rendering/sky/hdri/nightHdriDebug';
import { playerIlluminationRatio } from './rendering/sky/lightingCurves';
import { initSkySystem } from './rendering/sky/SkySystem';
import { applySkyForReveal } from './rendering/sky/skyRevealBlend';
import { sunDevState } from './rendering/sunDevState';
import { currentSunElevationDeg } from './rendering/sunSpherical';
import { checkWebGPUSupport, getWebGPUErrorMessage } from './rendering/webgpuCapability';
import { syncWorldLighting } from './rendering/worldLighting';
import { initDevPanel } from './ui/DevPanel';
import { tickDayCyclePanelSync } from './ui/dev/sky/devPanelDayCycle';
import { disposeFpsCounter, fpsCounterBegin, fpsCounterEnd } from './ui/FpsCounter';
import { initHUD } from './ui/HUD';
import { ensurePlayMapSelected } from './ui/MapSelectScreen';
import { initStoryLog } from './ui/StoryLog';
import { disposeWorldTerrain } from './world/disposeWorldTerrain';
import { type GrassSystem, initGrassSystem } from './world/grass/core/GrassSystem';
import { grassShadowUniforms } from './world/grass/config/grassUniforms';
import { updateLandmarkProximity } from './world/LandmarkProximity';
import {
  applyTerrainDevUniforms,
  initTerrainAtlases,
  loadTerrainTextures,
  type TerrainTextureSet,
} from './world/terrain';
import { buildWorld } from './world/WorldBuilder';
import { loadWaterNormals } from './world/water/loadWaterNormals';
import type { PantheonWaterInstance } from './world/water/pantheonWaterTypes';
import { syncPantheonWater } from './world/water/syncPantheonWater';
import { updateWaterReflectionQuality } from './world/water/updateWaterReflectionQuality';

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

  const loadingEl = document.getElementById('loading');
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

  if (!hasPlayMapId()) {
    if (loadingEl) loadingEl.classList.add('hidden');
    await ensurePlayMapSelected();
    if (loadingEl) loadingEl.classList.remove('hidden');
  }

  let playMap: MapFile;
  try {
    playMap = await loadPlayMapFile();
  } catch (err) {
    const message =
      err instanceof PlayMapValidationError || err instanceof Error
        ? err.message
        : 'Failed to load map.';
    console.error('[maps]', err);
    if (loadingEl) loadingEl.textContent = message;
    return;
  }

  const [startX, startZ] = getPlayerStartFromMap(playMap);

  let assets: AssetRegistry;
  let terrainTextures: TerrainTextureSet;
  let cloudTex: Texture;
  let waterNormals: Texture;
  let nightHdri: NightHdriAssets | null;
  try {
    [assets, terrainTextures, cloudTex, waterNormals, nightHdri] = await Promise.all([
      loadAllAssets(),
      loadTerrainTextures(),
      loadCloudTexture(),
      loadWaterNormals(),
      loadNightHdri(renderer).catch((err) => {
        console.error('Night HDRI load failed:', err);
        return null;
      }),
    ]);
  } catch (err) {
    console.error('Asset loading failed:', err);
    if (loadingEl) loadingEl.textContent = 'Failed to load world assets.';
    return;
  }

  initTerrainAtlases(renderer, terrainTextures.atlases);

  const skySystem = initSkySystem(scene, cloudTex, nightHdri);

  if (import.meta.env.DEV) {
    console.info(`[maps] Playing authored map: ${playMap.id}`);
  }

  const world = await buildWorld(scene, assets, terrainTextures, sun, waterNormals, {
    map: playMap,
  });
  const { terrain, debugInstancedMeshes, orbSystem, disposeLandmarks } = world;

  const origUploadBiomeMap = terrain.uploadBiomeMap.bind(terrain);
  const startTerrainY = terrain.getWorldY(startX, startZ);
  const startCameraY = orbHoverBaseY(startTerrainY, PHASE0.ORB.PLAYER_RADIUS);
  const waterMesh: PantheonWaterInstance | null =
    'isWaterMesh' in terrain.water ? (terrain.water as PantheonWaterInstance) : null;

  cameraInput = initCameraInput(canvas);
  const cameraRig = initCameraRig(camera, startX, startZ, startCameraY);
  if (import.meta.env.DEV) {
    applyTerrainDevUniforms(terrain.splatMaterial, true);
  }

  const player = initPlayerController(scene, terrain, startX, startZ);
  const lightingOpts = {
    terrainMaterial: terrain.splatMaterial,
    playerPosition: player.position,
    playerLight: player.playerLight,
    sun,
    ambientLight,
    camera,
  };
  syncWorldLighting(lightingOpts);

  let refreshDebugTargets: () => void = () => {};
  let grassSystem: GrassSystem | undefined;
  refreshDebugTargets = import.meta.env.DEV
    ? () => {
        postFX.setDebugTargets(
          buildPostFxDebugTargets({
            scene,
            terrainMesh: terrain.mesh,
            terrainMaterial: terrain.splatMaterial,
            water: terrain.water,
            clouds: skySystem.clouds,
            sky: skySystem.sky,
            mapPropMeshes: debugInstancedMeshes,
            grassMesh: grassSystem?.mesh,
            sun,
            grassShadowUniforms,
          }),
        );
      }
    : () => {};

  if (isMapGrassEnabled(playMap.grass)) {
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
  warmupSunShadowMap(renderer, scene, sun, camera, startX, startZ);
  await renderer.compileAsync(scene, camera);
  logRenderDebugInit(scene, camera, skySystem.clouds);

  const shadowDebugInput: ShadowDebugInput = {
    renderer,
    scene,
    sun,
    terrainMaterial: terrain.splatMaterial,
    terrainReceiveShadow: terrain.mesh.receiveShadow,
    terrainCastShadow: terrain.shadowCastMesh?.castShadow ?? false,
    mapPropMeshes: debugInstancedMeshes,
    disableShadowsDev: devSettings.renderDebug.disableShadows,
    grassShadowUniforms,
    energy: state.energy,
    energyCap: state.energyCap,
  };
  const onEnergyChangedForShadowDebug = () => {
    shadowDebugInput.energy = state.energy;
    shadowDebugInput.energyCap = state.energyCap;
    if (sun.intensity > 0.02) {
      logShadowDebug(shadowDebugInput, true);
    }
  };
  if (import.meta.env.DEV) {
    logShadowDebugInit(shadowDebugInput);
    bus.on('energy:changed', onEnergyChangedForShadowDebug);
  }

  if (loadingEl) loadingEl.classList.add('hidden');
  const cameraHint = document.getElementById('camera-hint');
  if (cameraHint) cameraHint.classList.add('visible');

  const worldReveal = initWorldReveal(postFX, ambientLight, sun, skySystem);
  const dayCycle = initDayCycle(sun, ambientLight, skySystem);
  const unsubHUD = initHUD();
  const unsubStoryLog = initStoryLog();

  const logRenderDebugNow = import.meta.env.DEV
    ? () => {
        logRenderDebugFrame({
          camera,
          sun,
          cloudsVisible: skySystem.clouds.visible,
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
    { terrainMaterial: terrain.splatMaterial, hasDisplacementMaps: terrainTextures.hasDisplacementMaps, grass: grassSystem },
    logRenderDebugNow,
    { sky: skySystem, sun, ambientLight },
  );

  let elapsed = 0;

  const runTeardown = () => {
    if (import.meta.env.DEV) {
      bus.off('energy:changed', onEnergyChangedForShadowDebug);
      disposeShadowDebug();
    }
    unsubHUD();
    unsubStoryLog();
    unsubDevPanel();
    worldReveal.dispose();
    dayCycle.dispose();
    skySystem.dispose();
    disposeLandmarks();
    grassSystem?.dispose();
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
      updateLandmarkProximity(player.position, dt);
    },
    async (_alpha, frameDelta) => {
      worldReveal.update(frameDelta);
      dayCycle.update(frameDelta);
      const sunElevationDeg = currentSunElevationDeg();
      const energyRatio =
        state.energyCap > 0 ? Math.min(1, Math.max(0, state.energy / state.energyCap)) : 0;
      player.updateIllumination(playerIlluminationRatio(energyRatio, sunElevationDeg), frameDelta);
      syncWorldLighting(lightingOpts);

      grassSystem?.update({
        playerPosition: player.position,
        playerRadius: PHASE0.ORB.PLAYER_RADIUS,
        camera,
        elapsed,
        sunIntensity: sun.intensity,
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
        applyTerrainDevUniforms(terrain.splatMaterial);
      }

      cameraRig.update(
        player.cameraAnchor,
        frameDelta,
        cameraInput!.getYaw(),
        cameraInput!.getPitch(),
      );
      updateSunShadowTarget(player.position.x, player.position.z, sun, sunElevationDeg);
      const hdriWeight = nightHdriWeightForGameState();
      skySystem.setNightHdriWeight(hdriWeight);
      if (import.meta.env.DEV) logNightHdriFrame(hdriWeight);
      applySkyForReveal(skySystem, postFX, sunElevationDeg);
      skySystem.update(sun, camera, elapsed);
      if (waterMesh) {
        updateWaterReflectionQuality(
          waterMesh,
          player.position,
          cameraInput!.getPitch(),
          skySystem.getDaylight(),
          frameDelta,
        );
        syncPantheonWater(
          waterMesh,
          sunElevationDeg,
          skySystem.getDaylight(),
          sunDevState.azimuthDeg,
        );
      }
      postFX.setGodraysFromSun(sun.intensity, sunElevationDeg);
      postFX.setBloomSkyReduceFromSun(sunElevationDeg);
      postFX.setDofFocus(camera, player.cameraAnchor, frameDelta);
      postFX.setDofBokehScale(dofBokehScaleFromReveal(energyRatio));

      if (import.meta.env.DEV) {
        shadowDebugInput.disableShadowsDev = devSettings.renderDebug.disableShadows;
        tickDayCyclePanelSync();
      }

      await grassSystem?.whenComputeReady();

      fpsCounterBegin();
      postFX.render();
      fpsCounterEnd();

      if (import.meta.env.DEV) {
        shadowDebugInput.energy = state.energy;
        shadowDebugInput.energyCap = state.energyCap;
        logShadowDebug(shadowDebugInput);
      }
    },
  );
}

main().catch(console.error);
