// src/core/gameTick.ts — per-frame update/render tick, extracted from main()'s bootstrap
import type { DirectionalLight, PerspectiveCamera } from 'three';
import { PHASE0 } from '../config/phase0';
import type { OrbSystemContext } from '../entities/EnergyOrb';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { setValleyFogFromSun } from '../rendering/atmosphere/valleyFog';
import type { CameraRig } from '../rendering/CameraRig';
import type { ShadowDebugInput } from '../rendering/debug/shadowDebugLog';
import type { PostFXContext } from '../rendering/PostFX';
import { dofBokehScaleFromReveal } from '../rendering/postfx/dofReveal';
import type { SunHorizonTracker } from '../rendering/postfx/sunHorizonOcclusion';
import { syncColorPipeline } from '../rendering/postfx/syncColorPipeline';
import { updateSunShadowTarget } from '../rendering/SceneSetup';
import { nightHdriWeightForGameState } from '../rendering/sky/hdri/nightHdriBlend';
import { playerIlluminationRatio } from '../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../rendering/sky/SkySystem';
import { currentSunAzimuthDeg, currentSunElevationDeg } from '../rendering/sunSpherical';
import { syncWorldLighting } from '../rendering/worldLighting';
import { tickBloomPanelSync } from '../ui/dev/devPanelBloom';
import { tickDayCyclePanelSync } from '../ui/dev/sky/devPanelDayCycle';
import { fpsCounterBegin, fpsCounterEnd } from '../ui/FpsCounter';
import type { WorldTerrain } from '../world/disposeWorldTerrain';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import { applyTerrainDevUniforms, type TerrainLodBoundsDebug } from '../world/terrain';
import type { PantheonWaterInstance } from '../world/water/pantheonWaterTypes';
import { syncPantheonWater } from '../world/water/syncPantheonWater';
import { updateWaterReflectionQuality } from '../world/water/updateWaterReflectionQuality';
import type { CameraInputContext } from './CameraInput';
import { devSettings, state } from './GameState';
import type { DayCycleContext } from './reveal/DayCycle';
import { isSunRevealDone, type WorldRevealContext } from './reveal/WorldReveal';

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
  worldReveal: WorldRevealContext;
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
    worldReveal,
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

  function fixedUpdate(dt: number): void {
    elapsed += dt;
    player.update(dt, cameraRig.getMovementAxes());
    orbSystem.update(player.position, dt);
  }

  async function render(_alpha: number, frameDelta: number): Promise<void> {
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

    cameraRig.update(player.cameraAnchor, frameDelta, cameraInput.getYaw(), cameraInput.getPitch());
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
        cameraInput.getPitch(),
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
  }

  return {
    fixedUpdate,
    render,
    getElapsed: () => elapsed,
  };
}
