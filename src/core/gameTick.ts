// src/core/gameTick.ts — per-frame update/render tick
import type { DirectionalLight, PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { profileBeginFrame, profileEndFrame, profileMark } from '../dev/profiling/frameHooks';
import type { OrbSystemContext } from '../entities/energyOrb';
import type { GuideLineSystemContext } from '../entities/guideLine/GuideLineSystem';
import type { PlayerControllerContext } from '../entities/PlayerController';
import type { Animals } from '../life/animals/animals';
import type { DriftFields } from '../life/particles/driftFields';
import type { PlaceLife } from '../life/placeLife';
import type { Overview } from '../overview/overviewController';
import type { AmbienceView } from '../rendering/ambience/ambienceView';
import type { CameraRig } from '../rendering/CameraRig';
import type { Cinematic } from '../rendering/cinematic';
import type { MeshCloudSystemContext } from '../rendering/clouds/MeshCloudSystem';
import type { ShadowDebugInput } from '../rendering/debug/shadowDebugLog';
import type { PostFXContext } from '../rendering/PostFX';
import { dofBokehScaleFromReveal } from '../rendering/postfx/dofReveal';
import { syncAtmosphere } from '../rendering/postfx/syncAtmosphere';
import { nightHdriWeightForGameState } from '../rendering/sky/hdri/nightHdriBlend';
import {
  applyWorldLightingFromElevation,
  getActiveLightingSample,
  playerIlluminationRatio,
} from '../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../rendering/sky/SkySystem';
import {
  resolveWorldCascadeVisibility,
  updateCloudCastShadowTarget,
  updateFarSunShadowTarget,
  updateNearCascadeShadowTarget,
  updateWorldCascadeShadow,
} from '../rendering/sunShadow';
import { currentSunElevationDeg } from '../rendering/sunSpherical';
import type { WeatherView } from '../rendering/weather/weatherView';
import { syncWorldLighting } from '../rendering/worldLighting';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { type PropLodGroup, updatePropLod } from '../world/mapProps/mapPropLod';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import type { PantheonWaterInstance } from '../world/water/mesh/pantheonWaterTypes';
import { syncPantheonWater } from '../world/water/sync/syncPantheonWater';
import { updateWaterReflectionQuality } from '../world/water/sync/updateWaterReflectionQuality';
import type { CameraInputContext } from './CameraInput';
import { getEnergyRatio } from './energy';
import { applyDevFrameOverridesLate, applyDevFrameOverridesMid } from './gameTickDevOverrides';
import type { DayCycleContext } from './reveal/DayCycle';

/** Matches syncWorldLighting's static (non-daylight) options, built once at bootstrap. */
type FrameTickLightingOptions = Omit<Parameters<typeof syncWorldLighting>[0], 'daylight'>;

export interface FrameTickContext {
  renderer: WebGPURenderer;
  player: PlayerControllerContext;
  cameraRig: CameraRig;
  cameraInput: CameraInputContext;
  /** The village overview: while active it takes the camera and the orb. */
  overview: Overview;
  /** Scripted views (the last night's cutscene): while one plays it takes the camera and the movement keys. */
  cinematic: Cinematic;
  orbSystem: OrbSystemContext;
  guideLine: GuideLineSystemContext;
  terrain: MapTerrainContext;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  postFX: PostFXContext;
  skySystem: SkySystemContext;
  cloudSystem: MeshCloudSystemContext | null;
  dayCycle: DayCycleContext;
  grassSystem: GrassSystem | undefined;
  lightingOpts: FrameTickLightingOptions;
  waterMesh: PantheonWaterInstance | null;
  playWaterY: number;
  /** `disableShadowsDev` is refreshed per frame so `window.__logShadowDebug()` matches the dev panel. */
  shadowDebugInput: ShadowDebugInput;
  propLodGroups: PropLodGroup[];
  /** Null when the map has no village seed. */
  village: VillageSystemContext | null;
  /** The weather where the camera is: rain, overcast sky, wet ground. */
  weatherView: WeatherView;
  /** The wind and the time of day as numbers every ambient system reads. */
  ambienceView: AmbienceView;
  /** Leaves and pollen on the wind. */
  driftFields: DriftFields;
  /** Sheep, hens and birds. */
  animals: Animals;
  /** The life at the story's places (fireflies, leaves, motes, flocks). */
  placeLife: PlaceLife;
  /** Continue the world's clocks from a save instead of from zero. */
  initialClocks?: FrameClocks;
}

/** The clocks that drive wind (grass, clouds, sky): a save keeps them so the sky carries on. */
export interface FrameClocks {
  /** Fixed-step seconds since the game began. */
  elapsed: number;
  /** Render-rate wind clock. */
  windClock: number;
}

export interface FrameTick {
  fixedUpdate: (dt: number) => void;
  render: (alpha: number, frameDelta: number) => Promise<void>;
  getElapsed: () => number;
  getClocks: () => FrameClocks;
}

/** Builds the fixed-step + render callbacks passed to `GameLoop.start`. */
export function createFrameTick(ctx: FrameTickContext): FrameTick {
  const {
    renderer,
    player,
    cameraRig,
    cameraInput,
    overview,
    cinematic,
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
    ambienceView,
    driftFields,
    animals,
    placeLife,
  } = ctx;

  let elapsed = ctx.initialClocks?.elapsed ?? 0;
  /** Render-rate cloud wind clock: the 50 Hz fixed `elapsed` steps cloud and shadow motion unevenly. */
  let windClock = ctx.initialClocks?.windClock ?? 0;

  const visualPlayerPos = new Vector3().copy(player.position);

  const visualCameraAnchor = new Vector3().copy(player.cameraAnchor);
  /** Where the world's detail centres: the orb, or the overview's view of the village. */
  const focusPos = new Vector3().copy(player.position);
  const focusAnchor = new Vector3().copy(player.cameraAnchor);

  const lightingSyncOpts: Parameters<typeof syncWorldLighting>[0] = {
    ...lightingOpts,
    playerPosition: visualPlayerPos,
    daylight: 0,
  };

  const devFrameCtx = {
    grassSystem,
    terrain,
    shadowDebugInput,
  };

  function fixedUpdate(dt: number): void {
    elapsed += dt;
    player.beginFixedStep();
    player.update(
      dt,
      cameraRig.getMovementAxes(),
      !(overview.capturesMovement() || cinematic.isPlaying()),
    );
    orbSystem.update(player.position, dt);
    village?.update(dt, player.position, elapsed);
    animals.update(dt);
  }

  async function render(alpha: number, frameDelta: number): Promise<void> {
    profileBeginFrame();
    profileMark('player');
    windClock += frameDelta;
    const visAnchor = player.getRenderCameraAnchor(alpha, visualCameraAnchor);
    // The overview poses the camera and sets where the orb is drawn, so it goes before the orb is placed.
    const overviewCamera = overview.update(
      frameDelta,
      visAnchor,
      cameraInput.getYaw(),
      cameraInput.getPitch(),
    );
    // Poses the camera over the overview's while a script plays.
    const cinematicCamera = cinematic.update(frameDelta);
    const playerPos = player.applyRenderPosition(alpha);
    overview.focusPoint(focusPos, playerPos);
    cinematic.focusPoint(focusPos, focusPos);
    const visPos = focusPos;
    // The terrain glow follows the orb as drawn, the cursor included.
    visualPlayerPos.copy(overview.cursorPosition() ?? playerPos);
    overview.focusPoint(focusAnchor, visAnchor);
    cinematic.focusPoint(focusAnchor, focusAnchor);

    dayCycle.update(frameDelta);
    // Before the lighting is pushed: the overcast sky dims the sun, the clouds and the ground.
    weatherView.update(frameDelta, elapsed);
    const sunElevationDeg = currentSunElevationDeg();
    ambienceView.update(frameDelta, windClock, elapsed, sunElevationDeg);
    driftFields.update(frameDelta);
    placeLife.update(frameDelta);
    // Always push sun/ambient/daylight from the active sample so DEV ToD overrides
    // (and orb night lift) take effect even while day-cycle scrub is frozen.
    applyWorldLightingFromElevation(sunElevationDeg, sun, lightingOpts.ambientLight, skySystem);
    const energyRatio = getEnergyRatio();
    player.updateIllumination(
      playerIlluminationRatio(player.getDisplayEnergy(), sunElevationDeg),
      frameDelta,
    );
    lightingSyncOpts.daylight = skySystem.getDaylight();
    syncWorldLighting(lightingSyncOpts);

    applyDevFrameOverridesMid(devFrameCtx);

    profileMark('camera');
    if (!overviewCamera && !cinematicCamera) {
      cameraRig.update(visAnchor, frameDelta, cameraInput.getYaw(), cameraInput.getPitch());
    }
    profileMark('grass');
    grassSystem?.update({
      playerPosition: visPos,
      camera,
      elapsed,
      dt: frameDelta,
      daylight: skySystem.getDaylight(),
      playerLightDistance: player.playerLight.distance,
      playerLightIntensity: player.playerLight.intensity,
    });
    profileMark('guide');
    guideLine.update(playerPos, camera.position, frameDelta);
    profileMark('village');
    village?.render(alpha, frameDelta, camera.position);
    animals.render(alpha, camera.position.x, camera.position.z);
    profileMark('world');
    updatePropLod(propLodGroups, visPos.x, visPos.z);
    profileMark('shadows');
    const shadowY = terrain.getWorldY(visPos.x, visPos.z);
    updateFarSunShadowTarget(visPos.x, shadowY, visPos.z, sun, sunElevationDeg);
    if (sun.intensity > 0) {
      updateNearCascadeShadowTarget(visPos.x, shadowY, visPos.z, sunElevationDeg);
      updateCloudCastShadowTarget(visPos.x, shadowY, visPos.z, sunElevationDeg);
    }
    // Resolve last frame's bake before re-posing the cascade for this frame's bake.
    resolveWorldCascadeVisibility(renderer);
    updateWorldCascadeShadow(sun, visPos.x, visPos.z, sunElevationDeg);
    profileMark('lighting');
    const hdriWeight = nightHdriWeightForGameState();
    skySystem.setNightHdriWeight(hdriWeight);
    const lightingSample = getActiveLightingSample(sunElevationDeg);
    syncAtmosphere(skySystem, postFX, {
      elevationDeg: sunElevationDeg,
      sunIntensity: sun.intensity,
    });
    profileMark('sky');
    cloudSystem?.update({
      camera,
      sun,
      elapsed: windClock,
      elevationDeg: sunElevationDeg,
      daylightFactor: lightingSample.daylightFactor,
      hdriWeight,
      atmosphereBlendT: lightingSample.atmosphereBlendT,
    });
    skySystem.update(sun, camera, windClock);
    profileMark('water');
    if (waterMesh) {
      updateWaterReflectionQuality(
        waterMesh,
        visPos,
        cinematic.viewPitch(overview.viewPitch(cameraInput.getPitch())),
        frameDelta,
        terrain.getWorldY,
        playWaterY,
        camera,
      );
      syncPantheonWater(waterMesh, sun, skySystem.getDaylight());
    }
    postFX.setDofFocus(camera, focusAnchor, frameDelta);
    // The overview is for reading the village and a cutscene for looking: no depth-of-field blur there.
    postFX.setDofBokehScale(
      dofBokehScaleFromReveal(energyRatio) * (1 - overview.weight()) * (1 - cinematic.weight()),
    );

    applyDevFrameOverridesLate(devFrameCtx);

    profileMark('postfx');
    // Rebuild boundary only — compact already ran synchronously in update().
    if (grassSystem && !grassSystem.isFieldReady()) {
      await grassSystem.whenComputeReady();
    }

    postFX.render();
    profileEndFrame(renderer);
  }

  return {
    fixedUpdate,
    render,
    getElapsed: () => elapsed,
    getClocks: () => ({ elapsed, windClock }),
  };
}
