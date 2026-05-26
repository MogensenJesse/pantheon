// src/main.ts
import { GameLoop } from './core/GameLoop';
import { initInputManager, disposeInputManager } from './core/InputManager';
import { initCameraInput, type CameraInputContext } from './core/CameraInput';
import { state, devSettings } from './core/GameState';
import { loadAllAssets } from './assets/AssetLoader';
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
import { initWorldReveal, sunRevealState } from './rendering/WorldReveal';
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
import { syncWorldLighting } from './dev/worldLighting';
import { buildWorld } from './world/WorldBuilder';
import { disposeGrassMaterial } from './world/grass/grassMaterial';
import { disposeTerrain } from './world/TerrainGenerator';
import { loadTerrainTextures } from './world/terrain';
import { applyTerrainDevUniforms } from './world/terrain';
import { updateLandmarkProximity } from './world/LandmarkProximity';
import { WORLD } from './world/WorldConfig';
import { initHUD } from './ui/HUD';
import { initStoryLog } from './ui/StoryLog';
import { initDevPanel } from './ui/DevPanel';
import { disposeFpsCounter, fpsCounterBegin, fpsCounterEnd } from './ui/FpsCounter';

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

  const postFX = initPostFX(renderer, scene, camera);
  const [startX, startZ] = WORLD.PLAYER_START.xz;

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

  const { terrain, scatterer, orbSystem } = buildWorld(scene, assets, terrainTextures, sun);
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

  const refreshDebugTargets = () => {
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
  };
  refreshDebugTargets();
  postFX.setRenderQuality(false);
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
        logRenderDebugFrame(
          {
            camera,
            sun,
            cloudsVisible: skySystem.clouds.visible,
            elapsed,
            energy: state.energy,
            energyCap: state.energyCap,
            orbCount: orbSystem.orbs.length,
            orbVisibleCount: countVisibleOrbs(orbSystem.orbs),
          },
          true,
        );
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
    scatterer.dispose();
    disposeGrassMaterial();
    orbSystem.dispose();
    player.dispose();
    disposeTerrain(terrain);
    terrainTextures.dispose();
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
      updateSunShadowTarget(player.position.x, player.position.z, sun, sunRevealState.yOffset);
      skySystem.update(sun, camera, elapsed);

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
