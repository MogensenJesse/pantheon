// src/core/gameTick.ts — per-frame update/render tick, extracted from main()'s bootstrap
import type { DirectionalLight, PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { profileBeginFrame, profileEndFrame, profileMark } from '../dev/profiling/frameHooks';
import type { OrbSystemContext } from '../entities/EnergyOrb';
import type { GuideLineSystemContext } from '../entities/guideLine/GuideLineSystem';
import type { PlayerControllerContext } from '../entities/PlayerController';
import type { CameraRig } from '../rendering/CameraRig';
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
  updateCloudCastShadowTarget,
  updateNearCascadeShadowTarget,
  updateSunShadowTarget,
} from '../rendering/sunShadow';
import { currentSunElevationDeg } from '../rendering/sunSpherical';
import { syncWorldLighting } from '../rendering/worldLighting';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import type { WorldTerrain } from '../world/MapTerrainBuilder';
import { type PropLodGroup, updatePropLod } from '../world/mapProps/mapPropLod';
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
  orbSystem: OrbSystemContext;
  guideLine: GuideLineSystemContext;
  terrain: WorldTerrain;
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
  /** Kept live so `window.__logShadowDebug()` reflects current dev-panel state. */
  shadowDebugInput: ShadowDebugInput;
  propLodGroups: PropLodGroup[];
}

export interface FrameTick {
  fixedUpdate: (dt: number) => void;
  render: (alpha: number, frameDelta: number) => Promise<void>;
  getElapsed: () => number;
}

/** Builds the fixed-step + render callbacks passed to `GameLoop.start`. */
export function createFrameTick(ctx: FrameTickContext): FrameTick {
  const {
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
    grassSystem,
    lightingOpts,
    waterMesh,
    playWaterY,
    shadowDebugInput,
    propLodGroups,
  } = ctx;

  let elapsed = 0;

  const visualPlayerPos = new Vector3().copy(player.position);
  const visualCameraAnchor = new Vector3().copy(player.cameraAnchor);

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
    player.update(dt, cameraRig.getMovementAxes());
    orbSystem.update(player.position, dt);
  }

  async function render(alpha: number, frameDelta: number): Promise<void> {
    profileBeginFrame();
    profileMark('player');
    const visPos = player.applyRenderPosition(alpha);
    const visAnchor = player.getRenderCameraAnchor(alpha, visualCameraAnchor);
    visualPlayerPos.copy(visPos);

    dayCycle.update(frameDelta);
    const sunElevationDeg = currentSunElevationDeg();
    // Always push sun/ambient/daylight from the active sample so DEV ToD overrides
    // (and orb night lift) take effect even while day-cycle scrub is frozen.
    applyWorldLightingFromElevation(
      sunElevationDeg,
      sun,
      lightingOpts.ambientLight,
      skySystem,
    );
    const energyRatio = getEnergyRatio();
    player.updateIllumination(
      playerIlluminationRatio(player.getDisplayEnergy(), sunElevationDeg),
      frameDelta,
    );
    lightingSyncOpts.daylight = skySystem.getDaylight();
    syncWorldLighting(lightingSyncOpts);

    applyDevFrameOverridesMid(devFrameCtx);

    profileMark('camera');
    cameraRig.update(visAnchor, frameDelta, cameraInput.getYaw(), cameraInput.getPitch());
    profileMark('grass');
    grassSystem?.update({
      playerPosition: player.position,
      camera,
      elapsed,
      dt: frameDelta,
      daylight: skySystem.getDaylight(),
      playerLightDistance: player.playerLight.distance,
      playerLightIntensity: player.playerLight.intensity,
    });
    profileMark('guide');
    guideLine.update(visPos, camera.position, frameDelta);
    profileMark('world');
    updatePropLod(propLodGroups, visPos.x, visPos.z);
    profileMark('shadows');
    const shadowY = terrain.getWorldY(visPos.x, visPos.z);
    updateSunShadowTarget(visPos.x, shadowY, visPos.z, sun, sunElevationDeg);
    if (sun.intensity > 0) {
      updateNearCascadeShadowTarget(visPos.x, shadowY, visPos.z, sunElevationDeg);
      updateCloudCastShadowTarget(visPos.x, shadowY, visPos.z, sunElevationDeg);
    }
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
      elapsed,
      elevationDeg: sunElevationDeg,
      daylightFactor: lightingSample.daylightFactor,
      hdriWeight,
      atmosphereBlendT: lightingSample.atmosphereBlendT,
    });
    skySystem.update(sun, camera, elapsed);
    profileMark('water');
    if (waterMesh) {
      updateWaterReflectionQuality(
        waterMesh,
        visPos,
        cameraInput.getPitch(),
        frameDelta,
        terrain.getWorldY,
        playWaterY,
        camera,
      );
      syncPantheonWater(waterMesh, sun, skySystem.getDaylight());
    }
    postFX.setDofFocus(camera, visAnchor, frameDelta);
    postFX.setDofBokehScale(dofBokehScaleFromReveal(energyRatio));

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
  };
}
