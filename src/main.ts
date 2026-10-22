// src/main.ts

import type { Texture } from 'three';
import { initAbilities } from './abilities/abilityRuntime';
import { disposeAssetRegistry } from './assets/AssetLoader';
import type { AssetRegistry } from './assets/assetManifest';
import { askForSave } from './bootstrap/askForSave';
import {
  finishPlayLoading,
  PLAY_LOADING_MSG,
  PLAY_LOADING_PROGRESS,
  runPlayAssetBatch,
} from './bootstrap/playLoadingPhases';
import { initRenderStack } from './bootstrap/renderStack';
import { warmUpShadowsAndPipelines } from './bootstrap/shadowWarmup';
import { startPoseOf } from './bootstrap/startPose';
import { PHASE0 } from './config/phase0';
import { WORLD } from './config/world';
import { type CameraInputContext, initCameraInput } from './core/CameraInput';
import { GameLoop } from './core/GameLoop';
import { createFrameTick } from './core/gameTick';
import { disposeInputManager, initInputManager } from './core/InputManager';
import { initDayCycle } from './core/reveal/DayCycle';
import { initWorldReveal } from './core/reveal/WorldReveal';
import { devDebugSettings } from './core/settings';
import { state } from './core/state/gameState';
import { initDevPanel } from './dev/panel/DevPanel';
import {
  disposePerformanceSuite,
  setPerformanceGrassSource,
  setPerformancePropLodSource,
} from './dev/profiling';
import { countVisibleOrbs } from './entities/energyOrb';
import { orbHoverBaseY } from './entities/orbFloat';
import { sampleOrbTerrainFooting } from './entities/orbTerrainFooting';
import { initPlayerController } from './entities/PlayerController';
import { initGameplay } from './gameplay/initGameplay';
import { initLandmarkBoons } from './gameplay/landmarkBoons';
import { initProgression } from './gameplay/progression';
import { setupSaving } from './gameplay/setupSaving';
import { initLandmarkRestoreProps } from './landmarks/landmarkRestoreProps';
import { initLandmarks } from './landmarks/landmarkRuntime';
import { landmarkPropKeys, withLandmarkStandIns } from './landmarks/landmarkStandIns';
import { getPlayerStartFromMap, type MapEntity, type MapFile } from './map/MapTypes';
import { applyMapCumulusDeck } from './map/mapCumulusDeck';
import { isMapGrassEnabled } from './map/mapGrassSettings';
import {
  DEFAULT_PLAY_MAP_ID,
  getPlayMapId,
  hasPlayMapId,
  loadPlayMapFile,
  setPlayMapId,
} from './map/play/playMapSelection';
import { PlayMapValidationError } from './map/play/validatePlayMap';
import { createOverview } from './overview/overviewController';
import { initCameraRig } from './rendering/CameraRig';
import { readCloudSettings } from './rendering/clouds/cloudConfig';
import { initMeshCloudSystem } from './rendering/clouds/MeshCloudSystem';
import { logRenderDebugFrame } from './rendering/debug/renderDebugLog';
import {
  disposeShadowDebug,
  logShadowDebugInit,
  type ShadowDebugInput,
} from './rendering/debug/shadowDebugLog';
import { ensureSceneGeometryUv } from './rendering/ensureGeometryUv';
import { disposePostFX } from './rendering/PostFX';
import { disposeSceneSetup } from './rendering/SceneSetup';
import type { NightHdriAssets } from './rendering/sky/hdri/loadNightHdri';
import { initSkySystem } from './rendering/sky/SkySystem';
import type { SunShadowDebugTargets } from './rendering/sunShadow';
import { installShadowCastSceneHooks } from './rendering/sunShadow';
import { waterSunReceiverUniforms } from './rendering/sunShadow/receiverUniforms';
import { createWeatherView } from './rendering/weather/weatherView';
import { checkWebGPUSupport, getWebGPUErrorMessage } from './rendering/webgpuCapability';
import { syncWorldLighting } from './rendering/worldLighting';
import { createGameSaveService, loadBootRestore } from './save/bootSave';
import { applyGameProfile } from './save/profile';
import { createIndexedDbStore } from './save/store';
import { modifiers } from './skills/modifiers';
import { initSkills } from './skills/skillRuntime';
import { initHUD } from './ui/HUD';
import { initUiKit, type NotifyKind, notify } from './ui/kit';
import { ensurePlayMapSelected } from './ui/MapSelectScreen';
import { createOverviewPowers } from './ui/overview/overviewPowers';
import { createOverviewUi } from './ui/overview/overviewUi';
import { initPlayLoadingScreen } from './ui/PlayLoadingScreen';
import { initStoryLog } from './ui/StoryLog';
import { initVillageHud } from './ui/village/VillageHud';
import { initVillageAlerts } from './ui/village/villageAlerts';
import { grassSharedUniforms } from './world/grass/config/grassUniforms';
import { type GrassSystem, initGrassSystem } from './world/grass/core/GrassSystem';
import { disposeMapTerrain } from './world/MapTerrainBuilder';
import { collectVillageSeeds } from './world/map/MapEntitySpawner';
import { propShadowUniforms } from './world/mapProps/config/mapPropShadowUniforms';
import { PROP_TREE_KEYS } from './world/mapProps/config/propShadowKeys';
import {
  applyTerrainDevUniforms,
  initTerrainAtlases,
  type TerrainTextureSet,
} from './world/terrain';
import { templeOf } from './world/village/model/buildings';
import { initVillageSystem, resolveSeed } from './world/village/VillageSystem';
import { villageDevState } from './world/village/villageDevState';
import { buildWorld } from './world/WorldBuilder';
import type { PantheonWaterInstance } from './world/water/mesh/pantheonWaterTypes';
import { createWeather, hashString } from './world/weather/weather';

let tornDown = false;
let cameraInput: CameraInputContext | null = null;
let disposeProbes: (() => void) | null = null;
let disposeUiKit: (() => void) | null = null;
function disposeSession(): void {
  if (tornDown) return;
  tornDown = true;
  GameLoop.stop();
  cameraInput?.dispose();
  cameraInput = null;
  disposeInputManager();
  disposeUiKit?.();
  disposeUiKit = null;
  if (import.meta.env.DEV) {
    disposeShadowDebug();
    disposeProbes?.();
    disposeProbes = null;
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

  disposeUiKit = initUiKit();
  if (import.meta.env.DEV) {
    // Installed with the kit, so the console can reach Settings and toasts before the game has loaded.
    const { initUiProbe } = await import('./dev/runtime/uiProbe');
    const offKit = disposeUiKit;
    const offProbe = initUiProbe();
    disposeUiKit = () => {
      offProbe();
      offKit();
    };
  }
  const loading = initPlayLoadingScreen();
  loading.setMessage(PLAY_LOADING_MSG.renderer);
  loading.setProgress(PLAY_LOADING_PROGRESS.renderer);
  initInputManager();

  // Before anything heavy loads: the start screen asks what this visit does (new game, continue, load),
  // unless the address already says (see save/saveRequest.ts).
  const saveStore = createIndexedDbStore();
  const saveRequest = await askForSave(loading, saveStore);

  const {
    renderer,
    scene,
    camera,
    ambientLight,
    sun,
    postFX,
    gradeLutReady,
    buildPostFxDebugTargets,
  } = await initRenderStack(canvas);

  if (!hasPlayMapId()) {
    if (import.meta.env.DEV) {
      loading.hide();
      await ensurePlayMapSelected();
      loading.show();
    } else {
      setPlayMapId(DEFAULT_PLAY_MAP_ID);
    }
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

  // Saves: the save the start screen (or the address) asked for is read and checked against this map
  // before anything changes; the game then builds from it.
  const villageSeed = resolveSeed(collectVillageSeeds(playMap.entities ?? []));
  const saveService = createGameSaveService(saveStore, getPlayMapId(), villageSeed);
  // Ask the browser to keep the saves when it is short of space (best effort; the answer is not needed).
  if (saveRequest.autosave) void navigator.storage?.persist?.().catch(() => {});
  // Said once the game is showing: a toast raised behind the loading screen is gone before it ends.
  const bootNotes: { text: string; kind: NotifyKind }[] = [];
  const boot = await loadBootRestore(saveService, saveRequest, (text, kind) => {
    console.warn('[save]', text);
    bootNotes.push({ text, kind });
  });
  if (boot) applyGameProfile(state, boot.profile.game);
  const skills = initSkills(boot?.profile.skills);
  const abilities = initAbilities(skills, boot?.profile.powers.cooldowns);

  const playerStart = getPlayerStartFromMap(playMap);
  const {
    x: startX,
    z: startZ,
    yawRad: startYawRad,
    pitchRad: startPitchRad,
  } = startPoseOf(boot, playerStart);

  let assets: AssetRegistry;
  let terrainTextures: TerrainTextureSet;
  let waterNormals: Texture;
  let nightHdri: NightHdriAssets | null;
  // Only the prop models this map places, landmark stand-ins included (a full catalog load was ~114 MiB, mostly unused).
  const assetKeys = new Set([
    ...withLandmarkStandIns(playMap.entities ?? []).flatMap((e) =>
      e.type === 'prop' ? [e.key] : [],
    ),
    ...landmarkPropKeys(playMap.entities ?? []),
  ]);
  try {
    ({ assets, terrainTextures, waterNormals, nightHdri } = await runPlayAssetBatch(
      loading,
      renderer,
      assetKeys,
    ));
  } catch (err) {
    console.error('Asset loading failed:', err);
    loading.showError('Failed to load world assets.');
    return;
  }

  loading.setMessage(PLAY_LOADING_MSG.stitch);
  loading.setProgress(PLAY_LOADING_PROGRESS.stitch);
  initTerrainAtlases(renderer, terrainTextures.atlases);

  applyMapCumulusDeck(playMap.clouds);
  const skySystem = initSkySystem(scene, nightHdri);
  const cloudSystem = initMeshCloudSystem(scene, sun);

  loading.setMessage(PLAY_LOADING_MSG.rocks);
  loading.setProgress(PLAY_LOADING_PROGRESS.rocks);
  const world = await buildWorld(scene, assets, terrainTextures, sun, waterNormals, {
    map: playMap,
  });
  const { terrain, debugInstancedMeshes, propLodGroups, orbSystem, guideLine, disposeMapEntities } =
    world;
  if (boot) {
    const found = orbSystem.restore(boot.profile.orbs);
    const saved = boot.profile.orbs.absorbed.length + boot.profile.orbs.relocated.length;
    if (found < saved) {
      console.warn(`[save] ${saved - found} saved orb(s) are not on this map any more`);
    }
  }
  cloudSystem?.bindTerrainHeight({
    heightMap: terrain.heightMap,
    worldSize: WORLD.SIZE,
    heightScale: WORLD.HEIGHT_SCALE,
    getWorldY: terrain.getWorldY,
  });

  const startFooting = sampleOrbTerrainFooting(terrain, startX, startZ, PHASE0.ORB.PLAYER_RADIUS);
  const startCameraY = orbHoverBaseY(
    startFooting.surfaceY,
    PHASE0.ORB.PLAYER_RADIUS,
    startFooting.normalY,
  );
  const waterMesh: PantheonWaterInstance | null =
    'isWaterMesh' in terrain.water ? (terrain.water as PantheonWaterInstance) : null;
  const playWaterY = terrain.waterLevelM;

  const lookInput = initCameraInput(canvas, startYawRad, startPitchRad);
  cameraInput = lookInput;
  const cameraRig = initCameraRig(camera, startX, startZ, startCameraY, startYawRad, startPitchRad);
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
  };
  syncWorldLighting({ ...lightingOpts, daylight: skySystem.getDaylight() });

  let refreshDebugTargets: () => void = () => {};
  let grassSystem: GrassSystem | undefined;
  const sunShadowDebugTargets: SunShadowDebugTargets = {
    terrain: terrain.splatMaterial.terrainUniforms.uShadowFloor,
    grass: grassSharedUniforms.uShadowFloor,
    props: propShadowUniforms.uShadowFloor,
    water: waterSunReceiverUniforms.uShadowFloor,
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
      playerPosition: player.position,
      camera,
      mapGrass: playMap.grass,
      mapEntities: playMap.entities ?? [],
      assets,
      onMeshReplaced: refreshDebugTargets,
    });
    world.grassSystem = grassSystem;
    if (import.meta.env.DEV) setPerformanceGrassSource(grassSystem);
  }

  // Storm fronts are aimed at the village (or the middle of the map): the same clock gives the same sky.
  const weather = createWeather({
    anchorX: villageSeed?.x ?? 0,
    anchorZ: villageSeed?.z ?? 0,
    seed: hashString(getPlayMapId()),
    windDirectionDeg: readCloudSettings().windDirectionDeg,
    chanceMul: () => modifiers.weatherChanceMul,
  });

  if (boot) weather.restore(boot.profile.powers.weather);

  // The weather where the camera is: rain streaks, a closing sky, wet ground. No weather in Phase 0.
  const weatherView = createWeatherView({
    scene,
    camera,
    weather,
    weatherOn: () => state.phase >= 1,
    forcedRain: () => (import.meta.env.DEV ? villageDevState.rain01 : null),
  });

  let village: Awaited<ReturnType<typeof initVillageSystem>>;
  try {
    village = await initVillageSystem({
      scene,
      renderer,
      grassSystem,
      sun,
      terrain,
      seeds: world.villageSeeds,
      trees: (playMap.entities ?? [])
        .filter(
          (e): e is Extract<MapEntity, { type: 'prop' }> =>
            e.type === 'prop' && PROP_TREE_KEYS.has(e.key),
        )
        .map((e) => ({ x: e.x, z: e.z, key: e.key, scale: e.scale })),
      propAssets: assets,
      propLodGroups,
      debugMeshes: debugInstancedMeshes,
      weather,
      restore: boot?.village ?? undefined,
    });
  } catch (err) {
    if (!boot) throw err;
    // The world is half built from a save whose village will not load: stop rather than mix them.
    console.error('[save] restoring the village failed:', err);
    loading.showError(
      'The saved village could not be restored. Reload without ?load to start a new game.',
    );
    return;
  }

  const disposeProgression = initProgression({ skills, village });
  if (import.meta.env.DEV) setPerformancePropLodSource(propLodGroups);

  refreshDebugTargets();
  ensureSceneGeometryUv(scene);
  installShadowCastSceneHooks(scene);
  loading.setMessage(PLAY_LOADING_MSG.light);
  loading.setProgress(PLAY_LOADING_PROGRESS.light);
  await warmUpShadowsAndPipelines({
    renderer,
    scene,
    camera,
    sun,
    x: startX,
    y: startFooting.surfaceY,
    z: startZ,
    village,
  });

  loading.setMessage(PLAY_LOADING_MSG.shaders);
  loading.setProgress(PLAY_LOADING_PROGRESS.shaders);
  await gradeLutReady;
  postFX.warmupEffectGraphs();

  const shadowDebugInput: ShadowDebugInput = {
    renderer,
    scene,
    sun,
    terrainMaterial: terrain.splatMaterial,
    terrainReceiveShadow: terrain.mesh.receiveShadow,
    terrainCastShadow: terrain.mesh.castShadow,
    mapPropMeshes: debugInstancedMeshes,
    disableShadowsDev: devDebugSettings.renderDebug.disableShadows,
    sunShadowDebugTargets,
  };
  if (import.meta.env.DEV) {
    logShadowDebugInit(shadowDebugInput);
  }

  await finishPlayLoading(loading);
  for (const note of bootNotes) notify(note);
  const cameraHint = document.getElementById('camera-hint');
  if (cameraHint) cameraHint.classList.add('visible');

  // The landmarks come before the world reveal: the sunrise waits for them, and the guide line leads to them.
  const landmarks = initLandmarks({
    landmarks: world.landmarks,
    initial: boot?.profile.landmarks,
    orbPlace: () => player.position,
  });
  const disposeLandmarkBoons = initLandmarkBoons({ landmarks, skills, village });
  const disposeRestoreProps = initLandmarkRestoreProps({
    scene,
    sun,
    assets,
    terrain,
    landmarks: world.landmarks,
    propLodGroups,
    state: landmarks.state,
    campOf: (kind) => {
      const site = village?.sim.remoteSites.find((r) => r.kind === kind);
      return site ? { x: site.campX, z: site.campZ } : null;
    },
  });
  guideLine.setFallbackTarget(() => {
    const place = landmarks.nextTarget();
    return place ? { id: `landmark:${place.kind}`, x: place.x, z: place.z } : null;
  });
  const worldReveal = initWorldReveal(ambientLight, sun, skySystem, landmarks);
  const dayCycle = initDayCycle(sun, ambientLight, skySystem);
  if (boot) dayCycle.restore(boot.profile.dayCycle);
  const unsubHUD = initHUD();
  const unsubStoryLog = initStoryLog();
  const unsubVillageAlerts = village ? initVillageAlerts() : () => {};

  const overviewTemple = village ? templeOf(village.sim.buildings) : undefined;
  const overview = createOverview({
    canvas,
    camera,
    cameraRig,
    cameraInput: lookInput,
    player,
    groundY: terrain.getWorldY,
    village: villageSeed ?? {
      x: startX,
      z: startZ,
      radiusM: PHASE0.OVERVIEW.FALLBACK_VILLAGE_RADIUS_M,
    },
    temple: overviewTemple
      ? {
          x: overviewTemple.x,
          z: overviewTemple.z,
          radiusM: Math.hypot(overviewTemple.halfW, overviewTemple.halfD),
        }
      : null,
    isConverted: () => village?.sim.converted ?? false,
  });
  // The overview has its own chip, and its power bar would sit on the HUD line.
  const unsubVillageHud = village
    ? initVillageHud(village, { hidden: overview.isActive })
    : () => {};

  const overviewUi = village
    ? createOverviewUi({
        overview,
        camera,
        village,
        groundY: terrain.getWorldY,
      })
    : null;

  const frameTick = createFrameTick({
    renderer,
    player,
    cameraRig,
    cameraInput,
    overview,
    orbSystem,
    guideLine,
    terrain,
    camera,
    sun,
    postFX,
    skySystem,
    cloudSystem,
    dayCycle,
    grassSystem,
    lightingOpts,
    waterMesh,
    playWaterY,
    shadowDebugInput,
    propLodGroups,
    village,
    weatherView,
    initialClocks: boot?.profile.clocks,
  });

  const gameplay = initGameplay({
    scene,
    camera,
    terrain,
    player,
    lookInput,
    orbSystem,
    shrines: world.shrines,
    landmarks,
    village,
    villageSeed,
    waterLevelM: playWaterY,
    skills,
    abilities,
    weather,
    clock: frameTick.getElapsed,
    windDirectionDeg: readCloudSettings().windDirectionDeg,
    savedQuest: boot?.profile.quest,
  });
  // The arch II powers are cast from the overview with the orb as the cursor.
  const overviewPowers = overviewUi
    ? createOverviewPowers({
        overview,
        list: gameplay.builderList,
        cast: gameplay.castBuilder,
        pick: overviewUi.pickAtMouse,
      })
    : null;
  const saving = setupSaving({
    store: saveStore,
    service: saveService,
    request: saveRequest,
    playSecondsAtStart: boot?.playSeconds ?? 0,
    dayCycle,
    player,
    lookInput,
    orbSystem,
    skills,
    questState: () => gameplay.quest?.state() ?? null,
    landmarkState: gameplay.landmarks.state,
    powers: () => ({
      cooldowns: abilities.cooldowns(),
      weather: weather.serialize(frameTick.getElapsed()),
    }),
    clocks: frameTick.getClocks,
    village,
    canPause: () => !overview.isActive(),
  });
  if (import.meta.env.DEV) {
    const { installProbes } = await import('./dev/runtime/installProbes');
    disposeProbes = installProbes({
      gameplay,
      saving,
      saveService,
      restored: boot,
      autosaving: saveRequest.autosave,
      skills,
      orbSystem,
      village,
      weather,
      clock: frameTick.getElapsed,
      overview,
      overviewUi,
      sun,
      playerPosition: player.position,
      getWorldY: terrain.getWorldY,
      getYaw: () => lookInput.getYaw(),
    });
  }

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
      grass: grassSystem,
    },
    logRenderDebugNow,
    { sky: skySystem, sun, ambientLight, cloudSystem },
    { terrainMaterial: terrain.splatMaterial },
    { propLodGroups },
    village ? { village } : undefined,
  );

  const runTeardown = () => {
    unsubHUD();
    unsubStoryLog();
    unsubVillageHud();
    unsubVillageAlerts();
    unsubDevPanel();
    saving.dispose();
    overviewPowers?.dispose();
    overviewUi?.dispose();
    overview.dispose();
    gameplay.dispose();
    disposeProgression();
    disposeLandmarkBoons();
    disposeRestoreProps();
    worldReveal.dispose();
    skills.dispose();
    dayCycle.dispose();
    skySystem.dispose();
    cloudSystem?.dispose();
    village?.dispose();
    disposeMapEntities();
    grassSystem?.dispose();
    orbSystem.dispose();
    guideLine.dispose();
    player.dispose();
    disposeMapTerrain(terrain);
    terrainTextures.dispose();
    waterNormals.dispose();
    disposeAssetRegistry(assets);
    disposeSession();
  };

  window.addEventListener('pagehide', runTeardown);

  GameLoop.start(
    (dt) => {
      frameTick.fixedUpdate(dt);
      gameplay.update(dt);
    },
    frameTick.render,
    renderer,
  );
  saving.setRunning();
}

main().catch(console.error);
