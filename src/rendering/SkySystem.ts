// src/rendering/SkySystem.ts — Preetham SkyMesh + procedural clouds + aerial fog
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
import { SKY_DEFAULTS, USE_HORIZON_CLOUDS } from './skyDefaults';
import { CAMERA_FAR, SKY_BACKGROUND } from './sceneConstants';

/** Dev panel hide-sky toggle controls skyMesh visibility. */
export type SkyBackgroundHandle = { visible: boolean };

export interface SkyParams {
  turbidity?: number;
  rayleigh?: number;
  mieCoefficient?: number;
  mieDirectionalG?: number;
  fogDensity?: number;
  cloudCoverage?: number;
  cloudDensity?: number;
  cloudElevation?: number;
  showSunDisc?: number;
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

const FOG_R = 0.5;
const FOG_G = 0.68;
const FOG_B = 0.88;
const FOG_DENSITY_DAY = SKY_DEFAULTS.fogDensity;

function applySkyMeshDefaults(skyMesh: SkyMesh): void {
  skyMesh.turbidity.value = SKY_DEFAULTS.turbidity;
  skyMesh.rayleigh.value = SKY_DEFAULTS.rayleigh;
  skyMesh.mieCoefficient.value = SKY_DEFAULTS.mieCoefficient;
  skyMesh.mieDirectionalG.value = SKY_DEFAULTS.mieDirectionalG;
  skyMesh.cloudCoverage.value = SKY_DEFAULTS.cloudCoverage;
  skyMesh.cloudDensity.value = SKY_DEFAULTS.cloudDensity;
  skyMesh.cloudElevation.value = SKY_DEFAULTS.cloudElevation;
  skyMesh.showSunDisc.value = SKY_DEFAULTS.showSunDisc;
}

export function initSkySystem(scene: Scene, cloudTexture: Texture): SkySystemContext {
  scene.background = new Color(SKY_BACKGROUND);

  const skyMesh = new SkyMesh();
  skyMesh.scale.setScalar(CAMERA_FAR * 0.9);
  applySkyMeshDefaults(skyMesh);
  (skyMesh.material as NodeMaterial).fog = false;
  scene.add(skyMesh);

  const cloudSystem = createCloudSystem(cloudTexture);
  cloudSystem.group.visible = USE_HORIZON_CLOUDS;
  scene.add(cloudSystem.group);

  const uFogColor = uniform(new Color(FOG_R, FOG_G, FOG_B));
  const uFogDensity = uniform(FOG_DENSITY_DAY);
  scene.fogNode = fog(uFogColor, densityFogFactor(uFogDensity));

  let daylight = 0.12;
  let debugSkyLogged = false;

  const applyDaylight = () => {
    uFogColor.value.r = FOG_R * daylight;
    uFogColor.value.g = FOG_G * daylight;
    uFogColor.value.b = FOG_B * daylight;
    const fogDay = Math.max(0.05, daylight);
    uFogDensity.value = FOG_DENSITY_DAY * (0.35 + 0.65 * fogDay * fogDay);
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
      skyMesh.position.copy(camera.position);
      _sunDir.copy(sun.position).sub(sun.target.position).normalize();
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
      if (params.mieCoefficient !== undefined) skyMesh.mieCoefficient.value = params.mieCoefficient;
      if (params.mieDirectionalG !== undefined) skyMesh.mieDirectionalG.value = params.mieDirectionalG;
      if (params.cloudCoverage !== undefined) skyMesh.cloudCoverage.value = params.cloudCoverage;
      if (params.cloudDensity !== undefined) skyMesh.cloudDensity.value = params.cloudDensity;
      if (params.cloudElevation !== undefined) skyMesh.cloudElevation.value = params.cloudElevation;
      if (params.showSunDisc !== undefined) skyMesh.showSunDisc.value = params.showSunDisc;
      if (params.fogDensity !== undefined) uFogDensity.value = params.fogDensity;
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
