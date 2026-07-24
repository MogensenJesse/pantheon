// src/core/gameTick.ts — per-frame update/render tick, extracted from main()'s bootstrap
import type { DirectionalLight, PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import type { OrbSystemContext } from '../entities/EnergyOrb';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { setValleyFogFromSun } from '../rendering/atmosphere/valleyFog';
import type { CameraRig } from '../rendering/CameraRig';
import type { MeshCloudSystemContext } from '../rendering/clouds/MeshCloudSystem';
import type { ShadowDebugInput } from '../rendering/debug/shadowDebugLog';
import type { PostFXContext } from '../rendering/PostFX';
import { dofBokehScaleFromReveal } from '../rendering/postfx/dofReveal';
import type { SunHorizonTracker } from '../rendering/postfx/sunHorizonOcclusion';
import { syncColorPipeline } from '../rendering/postfx/syncColorPipeline';
import { nightHdriWeightForGameState } from '../rendering/sky/hdri/nightHdriBlend';
import { getActiveLightingSample, playerIlluminationRatio } from '../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../rendering/sky/SkySystem';
import { updateCloudCastShadowTarget, updateSunShadowTarget } from '../rendering/sunShadow';
import { currentSunAzimuthDeg, currentSunElevationDeg } from '../rendering/sunSpherical';
import { syncWorldLighting } from '../rendering/worldLighting';
import { fpsCounterBegin, fpsCounterEnd } from '../ui/FpsCounter';
import type { WorldTerrain } from '../world/MapTerrainBuilder';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import type { TerrainLodBoundsDebug } from '../world/terrain';
import type { PantheonWaterInstance } from '../world/water/mesh/pantheonWaterTypes';
import { syncPantheonWater } from '../world/water/sync/syncPantheonWater';
import { updateWaterReflectionQuality } from '../world/water/sync/updateWaterReflectionQuality';
import type { CameraInputContext } from './CameraInput';
import { getEnergyRatio } from './energy';
import { devDebugSettings, runtimeSettings } from './GameState';
import { applyDevFrameOverridesLate, applyDevFrameOverridesMid } from './gameTickDevOverrides';
import type { DayCycleContext } from './reveal/DayCycle';
import { isSunRevealDone } from './reveal/WorldReveal';

/** Matches syncWorldLighting's static (non-daylight) options, built once at bootstrap. */
type FrameTickLightingOptions = Omit<Parameters<typeof syncWorldLighting>[0], 'daylight'>;

export interface FrameTickContext {
  player: PlayerControllerContext;
  cameraRig: CameraRig;
  cameraInput: CameraInputContext;
  orbSystem: OrbSystemContext;
  terrain: WorldTerrain;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  postFX: PostFXContext;
  skySystem: SkySystemContext;
  cloudSystem: MeshCloudSystemContext | null;
  dayCycle: DayCycleContext;
  sunHorizonTracker: SunHorizonTracker;
  grassSystem: GrassSystem | undefined;
  lodBoundsDebug: TerrainLodBoundsDebug | undefined;
  lightingOpts: FrameTickLightingOptions;
  waterMesh: PantheonWaterInstance | null;
  playWaterY: number;
  /** Kept live so `window.__logShadowDebug()` reflects current dev-panel state. */
  shadowDebugInput: ShadowDebugInput;
}

export interface FrameTick {
  fixedUpdate: (dt: number) => void;
  render: (alpha: number, frameDelta: number) => Promise<void>;
  getElapsed: () => number;
}

/** Builds the fixed-step + render callbacks passed to `GameLoop.start`. */
export function createFrameTick(ctx: FrameTickContext): FrameTick {
  const {
    player,
    cameraRig,
    cameraInput,
    orbSystem,
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
    sunHorizonTracker,
  };

  function fixedUpdate(dt: number): void {
    elapsed += dt;
    player.beginFixedStep();
    player.update(dt, cameraRig.getMovementAxes());
    orbSystem.update(player.position, dt);
  }

  async function render(alpha: number, frameDelta: number): Promise<void> {
    fpsCounterBegin();
    const visPos = player.applyRenderPosition(alpha);
    const visAnchor = player.getRenderCameraAnchor(alpha, visualCameraAnchor);
    visualPlayerPos.copy(visPos);

    dayCycle.update(frameDelta);
    const sunElevationDeg = currentSunElevationDeg();
    const energyRatio = getEnergyRatio();
    player.updateIllumination(playerIlluminationRatio(energyRatio, sunElevationDeg), frameDelta);
    lightingSyncOpts.daylight = skySystem.getDaylight();
    syncWorldLighting(lightingSyncOpts);

    applyDevFrameOverridesMid(devFrameCtx);

    grassSystem?.update({
      playerPosition: player.position,
      playerRadius: PHASE0.ORB.PLAYER_RADIUS,
      camera,
      elapsed,
      daylight: skySystem.getDaylight(),
      playerLightDistance: player.playerLight.distance,
      playerLightIntensity: player.playerLight.intensity,
    });
    cameraRig.update(visAnchor, frameDelta, cameraInput.getYaw(), cameraInput.getPitch());
    terrain.updateLod(visPos.x, visPos.z);
    if (lodBoundsDebug) {
      lodBoundsDebug.update(
        visPos.x,
        visPos.z,
        terrain.getWorldY(visPos.x, visPos.z),
        runtimeSettings.terrain.showLodBounds,
      );
    }
    updateSunShadowTarget(visPos.x, visPos.z, sun, sunElevationDeg);
    if (sun.intensity > 0) {
      updateCloudCastShadowTarget(visPos.x, visPos.z, sunElevationDeg);
    }
    const hdriWeight = nightHdriWeightForGameState();
    skySystem.setNightHdriWeight(hdriWeight);
    const horizonOcclusionEnabled = !import.meta.env.DEV || devDebugSettings.godraysHorizon.enabled;
    // Soft ramp uses smoothed silhouette. Hard-kill only when the sun is clearly below the
    // raw target (margin) so golden-hour grazing shafts survive, while EMA lag cannot leave
    // residual weight once the disk is deeply behind terrain.
    const sunHorizonElevationDeg = horizonOcclusionEnabled
      ? (() => {
          const sample = sunHorizonTracker.update(
            camera.position.x,
            camera.position.z,
            camera.position.y,
            currentSunAzimuthDeg(),
            terrain.getWorldY,
            frameDelta,
          );
          const margin = import.meta.env.DEV
            ? (devDebugSettings.godraysHorizon.hardOccludeMarginDeg ??
              VISUAL.godrays.horizonOcclusion.hardOccludeMarginDeg)
            : VISUAL.godrays.horizonOcclusion.hardOccludeMarginDeg;
          const deeplyOccluded = sunElevationDeg < sample.targetDeg - margin;
          return deeplyOccluded ? sample.targetDeg : sample.smoothedDeg;
        })()
      : -90;
    const lightingSample = getActiveLightingSample(sunElevationDeg);
    syncColorPipeline(skySystem, postFX, {
      elevationDeg: sunElevationDeg,
      sunIntensity: sun.intensity,
      vignetteEnergyRatio: energyRatio,
      revealActive: !isSunRevealDone(),
      sunHorizonElevationDeg,
    });
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
    if (waterMesh) {
      updateWaterReflectionQuality(
        waterMesh,
        visPos,
        cameraInput.getPitch(),
        frameDelta,
        terrain.getWorldY,
        playWaterY,
      );
      syncPantheonWater(waterMesh, sun, skySystem.getDaylight());
    }
    setValleyFogFromSun(sunElevationDeg, skySystem.getDaylight(), hdriWeight);
    postFX.setDofFocus(camera, visAnchor, frameDelta);
    postFX.setDofBokehScale(dofBokehScaleFromReveal(energyRatio));

    applyDevFrameOverridesLate(devFrameCtx);

    // Rebuild boundary only — common path stays sync; draw uses prev-frame indirect.
    if (grassSystem && !grassSystem.isFieldReady()) {
      await grassSystem.whenComputeReady();
    }

    postFX.render();
    fpsCounterEnd();
  }

  return {
    fixedUpdate,
    render,
    getElapsed: () => elapsed,
  };
}
