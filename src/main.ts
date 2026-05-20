// src/main.ts

import { GameLoop } from './core/GameLoop';

import { disposeInputManager } from './core/InputManager';

import { initCameraInput, type CameraInputContext } from './core/CameraInput';

import { loadAllAssets } from './assets/AssetLoader';

import { initPlayerParticle } from './entities/PlayerParticle';

import { initOrbSystem } from './entities/EnergyOrb';

import { initSceneSetup, disposeSceneSetup, updateSunShadowTarget } from './rendering/SceneSetup';

import { initPostFX, disposePostFX } from './rendering/PostFX';

import { initCameraRig } from './rendering/CameraRig';

import { initSkySystem } from './rendering/SkySystem';

import { buildTerrain, disposeTerrain } from './world/TerrainGenerator';

import { loadTerrainTextures } from './world/terrain/loadTerrainTextures';

import { applyTerrainDevUniforms } from './world/terrain/applyTerrainDevUniforms';

import { syncTerrainSplatLighting } from './world/terrain/TerrainSplatMaterial';

import { initWorldIllumination } from './world/WorldIllumination';

import { buildAssetScatterer } from './world/AssetScatterer';

import { buildLandmarkSpawner, buildMountainBorder } from './world/LandmarkSpawner';

import { updateLandmarkProximity } from './world/LandmarkProximity';

import { WORLD } from './world/WorldConfig';

import { initHUD } from './ui/HUD';

import { initStoryLog } from './ui/StoryLog';

import { initDevPanel } from './ui/DevPanel';

import { disposeFpsCounter, fpsCounterBegin, fpsCounterEnd } from './ui/FpsCounter';

let tornDown = false;

let cameraInput: CameraInputContext | null = null;



function teardown(): void {

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

  const canvas = document.getElementById('game');

  if (!(canvas instanceof HTMLCanvasElement)) {

    throw new Error('Missing #game canvas element');

  }

  const loadingEl = document.getElementById('loading');



  const { renderer, scene, camera, onResize, ambientLight, sun } = initSceneSetup(canvas);

  const skySystem = initSkySystem(scene, renderer);

  const postFX = initPostFX(renderer, scene, camera);



  const [startX, startZ] = WORLD.PLAYER_START.xz;



  let assets;

  let terrainTextures;

  try {

    [assets, terrainTextures] = await Promise.all([loadAllAssets(), loadTerrainTextures()]);

  } catch (err) {

    console.error('Asset loading failed:', err);

    if (loadingEl) loadingEl.textContent = 'Failed to load world assets.';

    return;

  }



  const terrain = buildTerrain(scene, terrainTextures);

  const startWorldY = terrain.getWorldY(startX, startZ);



  if (loadingEl) loadingEl.classList.add('hidden');



  const cameraHint = document.getElementById('camera-hint');

  if (cameraHint) cameraHint.classList.add('visible');



  cameraInput = initCameraInput(canvas);

  const cameraRig = initCameraRig(camera, startX, startZ, startWorldY);



  const scatterer = buildAssetScatterer(scene, assets, terrain);

  buildLandmarkSpawner(scene, assets, terrain);

  buildMountainBorder(scene, assets, terrain);

  syncTerrainSplatLighting(terrain.splatMaterial, sun, ambientLight, camera);

  if (import.meta.env.DEV) {

    applyTerrainDevUniforms(terrain.splatMaterial);

  }



  const orbSystem = initOrbSystem(scene, terrain);

  const player = initPlayerParticle(scene, terrain, startX, startZ);

  const worldIllumination = initWorldIllumination(player, postFX, ambientLight, sun, skySystem);



  const unsubHUD = initHUD();

  const unsubStoryLog = initStoryLog();

  const unsubDevPanel = initDevPanel(postFX, {
    terrainMaterial: terrain.splatMaterial,
  });



  let elapsed = 0;



  const offResize = onResize(() => {

    postFX.resize(window.innerWidth, window.innerHeight);

  });

  postFX.resize(window.innerWidth, window.innerHeight);



  const runTeardown = () => {

    unsubHUD();

    unsubStoryLog();

    unsubDevPanel();

    offResize();

    worldIllumination.dispose();

    skySystem.dispose();

    scatterer.dispose();

    orbSystem.dispose();

    disposeTerrain(terrain);

    terrainTextures.dispose();

    teardown();

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

      worldIllumination.update(frameDelta);

      syncTerrainSplatLighting(terrain.splatMaterial, sun, ambientLight, camera);

      if (import.meta.env.DEV) {

        applyTerrainDevUniforms(terrain.splatMaterial);

      }

      scatterer.updateWind(elapsed);

      cameraRig.update(

        player.position,

        frameDelta,

        cameraInput!.getYaw(),

        cameraInput!.getPitch(),

      );

      updateSunShadowTarget(player.position.x, player.position.z, sun);

      skySystem.update(sun, camera, elapsed);

      fpsCounterBegin();

      postFX.render();

      fpsCounterEnd();

    },

  );

}



main().catch(console.error);

