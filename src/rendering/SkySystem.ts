// src/rendering/SkySystem.ts — Preetham procedural sky (SkyMesh) + billboard clouds + aerial fog
import {
  Color,
  DirectionalLight,
  Object3D,
  Scene,
  Vector3,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import { NodeMaterial } from 'three/webgpu';
import { densityFogFactor, fog, uniform } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { createCloudSystem } from './CloudSystem';
import { logRenderDebugSky } from './renderDebugLog';
import { sunDevState } from './sunDevState';
import { CAMERA_FAR, SKY_BACKGROUND } from './sceneConstants';

/** Dev panel hide-sky toggle controls skyMesh visibility. */
export type SkyBackgroundHandle = { visible: boolean };

export interface SkyParams {
  turbidity?: number;
  rayleigh?: number;
  mieCoefficient?: number;
  mieDirectionalG?: number;
  fogDensity?: number;
  /** Multiplier on base mie coefficient (sun halo / apparent disc size). */
  sunSizeMul?: number;
  skyAzimuthOffsetDeg?: number;
  skyElevationOffsetDeg?: number;
}

export interface SkySystemContext {
  sky: SkyBackgroundHandle;
  clouds: Object3D;
  update: (sun: DirectionalLight, camera: PerspectiveCamera, elapsed: number) => void;
  setDaylight: (factor: number) => void;
  setSkyParams: (params: SkyParams) => void;
  dispose: () => void;
}

const _sunDir = new Vector3();
const _sunUp = new Vector3(0, 1, 0);
const _sunTiltAxis = new Vector3();
const DEG2RAD = Math.PI / 180;

// Fog base colour at full daylight (linear, sky-blue horizon tone).
const FOG_R = 0.50;
const FOG_G = 0.68;
const FOG_B = 0.88;
const FOG_DENSITY_DAY = 0.0008;
const BASE_MIE_COEFFICIENT = 0.005;

export function initSkySystem(scene: Scene, cloudTexture: Texture): SkySystemContext {
  // Solid fallback colour shown if the SkyMesh ever fails to cover a pixel.
  scene.background = new Color(SKY_BACKGROUND);

  // --- Preetham procedural sky (WebGPU TSL, SkyMesh is the WebGPU-native version of Sky) ---
  const skyMesh = new SkyMesh();
  // Scale to ~90 % of camera far so all fragments land within the frustum.
  skyMesh.scale.setScalar(CAMERA_FAR * 0.9);
  // Deep-blue morning defaults (tunable via setSkyParams / dev panel).
  // Low turbidity = clean, dark zenith. High rayleigh = saturated blue.
  skyMesh.turbidity.value = 3;
  skyMesh.rayleigh.value = 3.5;
  skyMesh.mieCoefficient.value = BASE_MIE_COEFFICIENT;
  skyMesh.mieDirectionalG.value = 0.95;
  // Exclude the sky itself from aerial fog — it renders at the far plane
  // so densityFogFactor would fully saturate it otherwise.
  (skyMesh.material as NodeMaterial).fog = false;
  scene.add(skyMesh);

  // --- Billboard cloud system ---
  const cloudSystem = createCloudSystem(cloudTexture);
  scene.add(cloudSystem.group);

  // --- Aerial perspective fog (applies to terrain, trees, grass; not sky) ---
  const uFogColor = uniform(new Color(FOG_R, FOG_G, FOG_B));
  const uFogDensity = uniform(FOG_DENSITY_DAY);
  scene.fogNode = fog(uFogColor, densityFogFactor(uFogDensity));

  let daylight = 0.12;
  let debugSkyLogged = false;

  const applyDaylight = () => {
    // Scale fog colour and density with daylight — no haze at night.
    uFogColor.value.r = FOG_R * daylight;
    uFogColor.value.g = FOG_G * daylight;
    uFogColor.value.b = FOG_B * daylight;
    uFogDensity.value = FOG_DENSITY_DAY * Math.max(0.05, daylight);
  };

  const sky: SkyBackgroundHandle = {
    get visible() {
      return skyMesh.visible;
    },
    set visible(value: boolean) {
      skyMesh.visible = value;
    },
  };

  applyDaylight();

  return {
    sky,
    clouds: cloudSystem.group,
    update(sun, camera, _elapsed) {
      // Re-centre the sky box on the camera so it always surrounds the viewer.
      skyMesh.position.copy(camera.position);
      // Drive the sky sun disc from the exact same DirectionalLight direction.
      _sunDir.copy(sun.position).sub(sun.target.position).normalize();
      if (sunDevState.skyAzimuthOffsetDeg !== 0) {
        _sunDir.applyAxisAngle(_sunUp, sunDevState.skyAzimuthOffsetDeg * DEG2RAD);
      }
      if (sunDevState.skyElevationOffsetDeg !== 0) {
        _sunTiltAxis.crossVectors(_sunDir, _sunUp);
        if (_sunTiltAxis.lengthSq() > 1e-6) {
          _sunTiltAxis.normalize();
          _sunDir.applyAxisAngle(_sunTiltAxis, sunDevState.skyElevationOffsetDeg * DEG2RAD);
        }
      }
      skyMesh.sunPosition.value.copy(_sunDir);

      if (import.meta.env.DEV) cloudSystem.syncDevSettings();
      cloudSystem.update(camera.position, daylight);

      if (import.meta.env.DEV && !debugSkyLogged) {
        debugSkyLogged = true;
        logRenderDebugSky(cloudSystem.group, sun, daylight);
      }
    },
    setDaylight(factor) {
      daylight = Math.max(0, Math.min(1, factor));
      applyDaylight();
    },
    setSkyParams(params: SkyParams) {
      if (params.turbidity !== undefined) skyMesh.turbidity.value = params.turbidity;
      if (params.rayleigh !== undefined) skyMesh.rayleigh.value = params.rayleigh;
      if (params.mieCoefficient !== undefined) {
        skyMesh.mieCoefficient.value = params.mieCoefficient;
      } else if (params.sunSizeMul !== undefined) {
        sunDevState.skySizeMul = params.sunSizeMul;
        skyMesh.mieCoefficient.value = BASE_MIE_COEFFICIENT * sunDevState.skySizeMul;
      }
      if (params.mieDirectionalG !== undefined) skyMesh.mieDirectionalG.value = params.mieDirectionalG;
      if (params.fogDensity !== undefined) uFogDensity.value = params.fogDensity;
      if (params.skyAzimuthOffsetDeg !== undefined) {
        sunDevState.skyAzimuthOffsetDeg = params.skyAzimuthOffsetDeg;
      }
      if (params.skyElevationOffsetDeg !== undefined) {
        sunDevState.skyElevationOffsetDeg = params.skyElevationOffsetDeg;
      }
    },
    dispose() {
      scene.fogNode = null;
      scene.remove(skyMesh);
      scene.remove(cloudSystem.group);
      cloudSystem.dispose();
      cloudTexture.dispose();
    },
  };
}
