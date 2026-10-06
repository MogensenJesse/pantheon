// src/core/gameTick.ts — per-frame update/render tick, extracted from main()'s bootstrap
import type { DirectionalLight, PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { WORLD } from '../config/world';
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
  getWorldCascadeBakeCount,
  getWorldCascadeRenderedBakeCount,
  getWorldCascadeTune,
  getWorldShadowView,
  invalidateWorldCascadeShadowMap,
  readWorldVisibilityAt,
  resolveWorldCascadeVisibility,
  setWorldCascadeTune,
  setWorldShadowView,
  updateCloudCastShadowTarget,
  updateNearCascadeShadowTarget,
  updateSunShadowTarget,
  updateWorldCascadeShadow,
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

  if (import.meta.env.DEV) {
    /**
     * DEV ground truth for sun shadows: march the CPU terrain from the player toward the real
     * sun and report the first terrain above the ray (null = the player's spot sees the sun).
     */
    (window as unknown as Record<string, unknown>).__pantheonShadowProbe = (stepM = 2) => {
      const dir = new Vector3().subVectors(sun.position, sun.target.position).normalize();
      const x0 = visualPlayerPos.x;
      const z0 = visualPlayerPos.z;
      const y0 = terrain.getWorldY(x0, z0) + 0.5;
      const half = WORLD.SIZE * 0.5;
      const sunElevationDeg = (Math.asin(dir.y) * 180) / Math.PI;
      for (let t = stepM; t < 6000; t += stepM) {
        const x = x0 + dir.x * t;
        const z = z0 + dir.z * t;
        if (Math.abs(x) > half || Math.abs(z) > half) break;
        const groundY = terrain.getWorldY(x, z);
        const rayY = y0 + dir.y * t;
        if (groundY > rayY) {
          return {
            blocked: true,
            occluderDistanceM: Math.round(t),
            occluderXZ: [Math.round(x), Math.round(z)],
            occluderGroundY: Math.round(groundY),
            rayY: Math.round(rayY),
            playerXZ: [Math.round(x0), Math.round(z0)],
            sunElevationDeg: +sunElevationDeg.toFixed(1),
          };
        }
      }
      return {
        blocked: false,
        playerXZ: [Math.round(x0), Math.round(z0)],
        sunElevationDeg: +sunElevationDeg.toFixed(1),
      };
    };

    /**
     * DEV: locate a world-map occluder at the player's spot. Sweeps the world push toward the
     * sun (cast-only view) and reports where the spot turns lit, plus the CPU terrain there.
     */
    (window as unknown as Record<string, unknown>).__pantheonShadowPhantom = async () => {
      const waitFrames = (n: number) =>
        new Promise<void>((resolve) => {
          let left = n;
          const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
          requestAnimationFrame(step);
        });
      const dir = new Vector3().subVectors(sun.position, sun.target.position).normalize();
      const x0 = visualPlayerPos.x;
      const z0 = visualPlayerPos.z;
      const y0 = terrain.getWorldY(x0, z0);
      const prevPush = getWorldCascadeTune().pushM;
      const prevView = getWorldShadowView();
      setWorldShadowView('castOnly');
      const sweep: { pushM: number; full: number }[] = [];
      const renderedBefore = getWorldCascadeRenderedBakeCount();
      const requestedBefore = getWorldCascadeBakeCount();
      try {
        for (const pushM of [0, 4, 16, 64, 128, 256, 512, 1024, 2048, 4096]) {
          setWorldCascadeTune({ pushM });
          invalidateWorldCascadeShadowMap();
          await waitFrames(8);
          const v = await readWorldVisibilityAt(x0, z0);
          sweep.push({ pushM, full: v ? +v.full.toFixed(2) : Number.NaN });
        }
      } finally {
        setWorldCascadeTune({ pushM: prevPush });
        setWorldShadowView(prevView);
      }
      const litAt = sweep.findIndex((s) => s.full > 0.5);
      const describe = (t: number) => {
        const x = x0 + dir.x * t;
        const z = z0 + dir.z * t;
        return {
          alongRayM: t,
          xz: [Math.round(x), Math.round(z)],
          rayY: Math.round(y0 + dir.y * t),
          terrainY: Math.round(terrain.getWorldY(x, z)),
        };
      };
      return {
        bakesRequested: getWorldCascadeBakeCount() - requestedBefore,
        bakesRendered: getWorldCascadeRenderedBakeCount() - renderedBefore,
        playerXZ: [Math.round(x0), Math.round(z0)],
        playerY: Math.round(y0),
        sunElevationDeg: +((Math.asin(dir.y) * 180) / Math.PI).toFixed(1),
        sweep,
        occluderBetween:
          litAt > 0
            ? [describe(sweep[litAt - 1]!.pushM), describe(sweep[litAt]!.pushM)]
            : litAt === 0
              ? 'spot is lit in the world map even at push 0'
              : 'still shadowed at 4 km push (occluder beyond the map or bake broken)',
      };
    };
  }
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
    cameraRig.update(visAnchor, frameDelta, cameraInput.getYaw(), cameraInput.getPitch());
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
    guideLine.update(visPos, camera.position, frameDelta);
    profileMark('world');
    updatePropLod(propLodGroups, visPos.x, visPos.z);
    profileMark('shadows');
    const shadowY = terrain.getWorldY(visPos.x, visPos.z);
    updateSunShadowTarget(visPos.x, shadowY, visPos.z, sun, sunElevationDeg);
    if (sun.intensity > 0) {
      updateNearCascadeShadowTarget(visPos.x, shadowY, visPos.z, sunElevationDeg);
      updateCloudCastShadowTarget(visPos.x, shadowY, visPos.z, sunElevationDeg, elapsed);
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
