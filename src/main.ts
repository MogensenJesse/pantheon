// src/main.ts

import type { Texture } from 'three';
import type { WaterMesh } from 'three/addons/objects/WaterMesh.js';
import { disposeAssetRegistry, loadAllAssets } from './assets/AssetLoader';
import type { AssetRegistry } from './assets/assetManifest';
import { PHASE0 } from './config/phase0';
import { type CameraInputContext, initCameraInput } from './core/CameraInput';
import { bus } from './core/EventBus';
import { GameLoop } from './core/GameLoop';
import { devSettings, state } from './core/GameState';
import { disposeInputManager, initInputManager } from './core/InputManager';
import { getSunRevealProgress, initWorldReveal, isSunRevealDone } from './core/reveal/WorldReveal';
import { buildPostFxDebugTargets } from './dev/postFxDebugTargets';
import { countVisibleOrbs } from './entities/EnergyOrb';
import { orbHoverBaseY } from './entities/orbFloat';
import { initPlayerController } from './entities/PlayerController';
import { getPlayerStartFromMap, type MapFile } from './map/MapTypes';
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
import {
  disposeSceneSetup,
  initSceneSetup,
  type SceneContext,
  updateSunShadowTarget,
} from './rendering/SceneSetup';
import { loadNightHdri, type NightHdriAssets } from './rendering/sky/hdri/loadNightHdri';
import { nightHdriWeightForGameState } from './rendering/sky/hdri/nightHdriBlend';
import { logNightHdriFrame } from './rendering/sky/hdri/nightHdriDebug';
import { initSkySystem } from './rendering/sky/SkySystem';
import { applySkyForReveal } from './rendering/sky/skyRevealBlend';
import { sunDevState } from './rendering/sunDevState';
import { currentSunElevationDeg } from './rendering/sunSpherical';
import { checkWebGPUSupport, getWebGPUErrorMessage } from './rendering/webgpuCapability';
import { syncWorldLighting } from './rendering/worldLighting';
import { initDevPanel } from './ui/DevPanel';
import { disposeFpsCounter, fpsCounterBegin, fpsCounterEnd } from './ui/FpsCounter';
import { initHUD } from './ui/HUD';
import { ensurePlayMapSelected } from './ui/MapSelectScreen';
import { initStoryLog } from './ui/StoryLog';
import { disposeWorldTerrain } from './world/disposeWorldTerrain';
import { updateLandmarkProximity } from './world/LandmarkProximity';
import {
  applyTerrainDevUniforms,
  loadTerrainTextures,
  type TerrainTextureSet,
} from './world/terrain';
import { initGrassSystem } from './world/grass/GrassSystem';
import { buildWorld } from './world/WorldBuilder';
import { loadWaterNormals } from './world/water/loadWaterNormals';
import { syncPantheonWater } from './world/water/syncPantheonWater';

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

  const skySystem = initSkySystem(scene, cloudTex, nightHdri);

  if (import.meta.env.DEV) {
    console.info(`[maps] Playing authored map: ${playMap.id}`);
  }

  const world = await buildWorld(scene, assets, terrainTextures, sun, waterNormals, {
    map: playMap,
  });
  const { terrain, debugInstancedMeshes, orbSystem, disposeLandmarks } = world;

  const grassSystem = await initGrassSystem(scene, renderer, terrain);
  world.grassSystem = grassSystem;

  const origUploadBiomeMap = terrain.uploadBiomeMap.bind(terrain);
  terrain.uploadBiomeMap = () => {
    origUploadBiomeMap();
    grassSystem.onTerrainMapsUpdated();
  };
  const startTerrainY = terrain.getWorldY(startX, startZ);
  const startCameraY = orbHoverBaseY(startTerrainY, PHASE0.ORB.PLAYER_RADIUS);
  const waterMesh = 'isWaterMesh' in terrain.water ? (terrain.water as unknown as WaterMesh) : null;

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

  const refreshDebugTargets = import.meta.env.DEV
    ? () => {
        postFX.setDebugTargets(
          buildPostFxDebugTargets({
            scene,
            terrainMesh: terrain.mesh,
            terrainMaterial: terrain.splatMaterial,
            water: waterMesh!,
            clouds: skySystem.clouds,
            sky: skySystem.sky,
            mapPropMeshes: debugInstancedMeshes,
            grassMesh: grassSystem.mesh,
            sun,
          }),
        );
      }
    : () => {};
  refreshDebugTargets();
  ensureSceneGeometryUv(scene);
  await renderer.compileAsync(scene, camera);
  logRenderDebugInit(scene, camera, skySystem.clouds);

  const shadowDebugInput: ShadowDebugInput = {
    renderer,
    scene,
    sun,
    terrainMaterial: terrain.splatMaterial,
    terrainReceiveShadow: terrain.mesh.receiveShadow,
    mapPropMeshes: debugInstancedMeshes,
    disableShadowsDev: devSettings.renderDebug.disableShadows,
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

  const worldReveal = initWorldReveal(player, postFX, ambientLight, sun, skySystem);
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
    { terrainMaterial: terrain.splatMaterial, grass: grassSystem },
    logRenderDebugNow,
    skySystem,
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
    skySystem.dispose();
    disposeLandmarks();
    grassSystem.dispose();
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
    (_alpha, frameDelta) => {
      worldReveal.update(frameDelta);
      syncWorldLighting(lightingOpts);

      grassSystem.update({
        playerPosition: player.position,
        playerRadius: PHASE0.ORB.PLAYER_RADIUS,
        camera,
        elapsed,
        sunIntensity: sun.intensity,
      });
      if (import.meta.env.DEV && devSettings.grass.enabled !== grassSystem.mesh.visible) {
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
      const sunElevationDeg = currentSunElevationDeg();
      updateSunShadowTarget(player.position.x, player.position.z, sun, sunElevationDeg);
      const hdriWeight = nightHdriWeightForGameState();
      skySystem.setNightHdriWeight(hdriWeight);
      if (import.meta.env.DEV) logNightHdriFrame(hdriWeight);
      const revealT = getSunRevealProgress();
      if (revealT !== null) {
        applySkyForReveal(skySystem, postFX, revealT);
      } else {
        applySkyForReveal(skySystem, postFX, isSunRevealDone() ? 1 : 0);
      }
      skySystem.update(sun, camera, elapsed);
      if (waterMesh) {
        syncPantheonWater(
          waterMesh,
          sunElevationDeg,
          skySystem.getDaylight(),
          sunDevState.azimuthDeg,
        );
      }
      postFX.setGodraysFromSun(sun.intensity, sunElevationDeg);
      postFX.setDofFocus(camera, player.cameraAnchor, frameDelta);
      const energyRatio = state.energyCap > 0 ? state.energy / state.energyCap : 0;
      postFX.setDofBokehScale(dofBokehScaleFromReveal(energyRatio));

      if (import.meta.env.DEV) {
        shadowDebugInput.disableShadowsDev = devSettings.renderDebug.disableShadows;
      }

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
