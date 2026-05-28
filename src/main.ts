// src/main.ts
import { GameLoop } from './core/GameLoop';
import { initInputManager, disposeInputManager } from './core/InputManager';
import { initCameraInput, type CameraInputContext } from './core/CameraInput';
import { state, devSettings } from './core/GameState';
import { loadAllAssets, disposeAssetRegistry } from './assets/AssetLoader';
import { orbHoverBaseY } from './entities/orbFloat';
import { initPlayerController } from './entities/PlayerController';
import { PHASE0 } from './config/phase0';
import { countVisibleOrbs } from './entities/EnergyOrb';
import {
  initSceneSetup,
  disposeSceneSetup,
  updateSunShadowTarget,
  type SceneContext,
} from './rendering/SceneSetup';
import { initPostFX, disposePostFX } from './rendering/PostFX';
import { initCameraRig } from './rendering/CameraRig';
import { loadCloudTexture } from './rendering/loadCloudTexture';
import { initSkySystem } from './rendering/SkySystem';
import { initWorldReveal } from './rendering/WorldReveal';
import { applySkyAtmosphereForElevation } from './rendering/skyElevationBlend';
import { currentSunElevationDeg } from './rendering/sunSpherical';
import { ensureSceneGeometryUv } from './rendering/ensureGeometryUv';
import { logRenderDebugFrame, logRenderDebugInit } from './rendering/renderDebugLog';
import {
  disposeShadowDebug,
  logShadowDebug,
  logShadowDebugInit,
  type ShadowDebugInput,
} from './rendering/shadowDebugLog';
import { bus } from './core/EventBus';
import { checkWebGPUSupport, getWebGPUErrorMessage } from './rendering/webgpuCapability';
import { buildPostFxDebugTargets } from './dev/postFxDebugTargets';
import { syncWorldLighting } from './rendering/worldLighting';
import { buildWorld } from './world/WorldBuilder';
import { disposeWorldTerrain } from './world/disposeWorldTerrain';
import { disposeGrassMaterial } from './world/grass/grassMaterial';
import { loadPlayMapFile } from './map/playMapSelection';
import { loadTerrainTextures } from './world/terrain';
import { applyTerrainDevUniforms } from './world/terrain';
import { updateLandmarkProximity } from './world/LandmarkProximity';
import { getPlayerStartFromMap } from './map/MapTypes';
import { initHUD } from './ui/HUD';
import { initStoryLog } from './ui/StoryLog';
import { initDevPanel } from './ui/DevPanel';
import { disposeFpsCounter, fpsCounterBegin, fpsCounterEnd } from './ui/FpsCounter';

let tornDown = false;
let cameraInput: CameraInputContext | null = null;
let _lastAppliedElevDeg = Number.NaN;
const ELEV_APPLY_EPSILON_DEG = 0.05;

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
  let onResize: SceneContext['onResize'];
  let ambientLight: SceneContext['ambientLight'];
  let sun: SceneContext['sun'];

  try {
    ({ renderer, scene, camera, onResize, ambientLight, sun } = await initSceneSetup(canvas));
  } catch (err) {
    console.error('WebGPURenderer init failed:', err);
    document.body.appendChild(getWebGPUErrorMessage());
    throw err;
  }

  const postFX = initPostFX(renderer, scene, camera, sun);
  const playMapForStart = await loadPlayMapFile();
  const [startX, startZ] = getPlayerStartFromMap(playMapForStart ?? undefined);

  let assets;
  let terrainTextures;
  let cloudTex;
  try {
    [assets, terrainTextures, cloudTex] = await Promise.all([
      loadAllAssets(),
      loadTerrainTextures(),
      loadCloudTexture(),
    ]);
  } catch (err) {
    console.error('Asset loading failed:', err);
    if (loadingEl) loadingEl.textContent = 'Failed to load world assets.';
    return;
  }

  const skySystem = initSkySystem(scene, cloudTex);

  const playMap = playMapForStart;
  if (playMap && import.meta.env.DEV) {
    console.info(`[maps] Playing authored map: ${playMap.id}`);
  }

  const { terrain, scatterer, orbSystem, disposeLandmarks } = buildWorld(
    scene,
    assets,
    terrainTextures,
    sun,
    { map: playMap ?? undefined },
  );
  const startTerrainY = terrain.getWorldY(startX, startZ);
  const startCameraY = orbHoverBaseY(startTerrainY, PHASE0.ORB.PLAYER_RADIUS);

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
  scatterer.updateGrassCull(player.position.x, player.position.z);

  const refreshDebugTargets = import.meta.env.DEV
    ? () => {
        postFX.setDebugTargets(
          buildPostFxDebugTargets({
            scene,
            terrainMesh: terrain.mesh,
            water: terrain.water,
            clouds: skySystem.clouds,
            sky: skySystem.sky,
            scatterer,
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
    scatterer,
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
    { terrainMaterial: terrain.splatMaterial, scatterer },
    logRenderDebugNow,
    skySystem,
  );

  let elapsed = 0;
  const offResize = onResize(() => {
    postFX.resize(window.innerWidth, window.innerHeight);
  });
  postFX.resize(window.innerWidth, window.innerHeight);

  const runTeardown = () => {
    if (import.meta.env.DEV) {
      bus.off('energy:changed', onEnergyChangedForShadowDebug);
      disposeShadowDebug();
    }
    unsubHUD();
    unsubStoryLog();
    unsubDevPanel();
    offResize();
    worldReveal.dispose();
    skySystem.dispose();
    disposeLandmarks();
    scatterer.dispose();
    disposeGrassMaterial();
    orbSystem.dispose();
    player.dispose();
    disposeWorldTerrain(terrain);
    terrainTextures.dispose();
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
      scatterer.updateGrassCull(player.position.x, player.position.z);

      if (import.meta.env.DEV && devSettings.terrain.dirty) {
        applyTerrainDevUniforms(terrain.splatMaterial);
      }
      if (import.meta.env.DEV && devSettings.grass.dirty) {
        scatterer.rebuildGrass();
        refreshDebugTargets();
      }

      cameraRig.update(
        player.cameraAnchor,
        frameDelta,
        cameraInput!.getYaw(),
        cameraInput!.getPitch(),
      );
      const sunElevationDeg = currentSunElevationDeg();
      updateSunShadowTarget(player.position.x, player.position.z, sun, sunElevationDeg);
      if (
        Number.isNaN(_lastAppliedElevDeg) ||
        Math.abs(sunElevationDeg - _lastAppliedElevDeg) >= ELEV_APPLY_EPSILON_DEG
      ) {
        applySkyAtmosphereForElevation(skySystem, postFX, sunElevationDeg);
        _lastAppliedElevDeg = sunElevationDeg;
      }
      skySystem.update(sun, camera, elapsed);
      postFX.setGodraysFromSun(sun.intensity, sunElevationDeg);

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
