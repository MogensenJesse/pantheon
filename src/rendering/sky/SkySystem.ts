// src/rendering/sky/SkySystem.ts — Preetham SkyMesh + procedural clouds + aerial fog
import {
  Color,
  type DirectionalLight,
  Euler,
  MathUtils,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  Vector3,
} from 'three';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { densityFogFactor, fog, mul, uniform, vec4 } from 'three/tsl';
import type { NodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { logRenderDebugSky } from '../debug/renderDebugLog';
import { CAMERA_FAR, SKY_BACKGROUND } from '../sceneConstants';
import { createCloudSystem } from './CloudSystem';
import type { NightHdriAssets } from './hdri/loadNightHdri';
import type { NightHdriTuning } from './hdri/nightHdriRuntime';
import * as nightHdriRuntime from './hdri/nightHdriRuntime';
import { SKY_DEFAULTS, USE_HORIZON_CLOUDS } from './skyDefaults';

const _bgRotation = new Euler(0, 0, 0, 'YXZ');

/** Dev panel hide-sky toggles SkyMesh + night HDRI together. */
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
  getDaylight: () => number;
  setSkyParams: (params: SkyParams) => void;
  setSkyExposure: (factor: number) => void;
  setNightHdriWeight: (weight: number) => void;
  hasNightHdri: boolean;
  getNightHdriTuning: () => Readonly<NightHdriTuning>;
  setNightHdriTuning: (partial: Partial<NightHdriTuning>) => void;
  resetNightHdriTuning: () => void;
  dispose: () => void;
}

const _sunDir = new Vector3();

const FOG_R = 0.5;
const FOG_G = 0.68;
const FOG_B = 0.88;
/** Night fog tint — aligned with horizon cloud night color to reduce banding vs sky. */
const FOG_NIGHT_R = 0.04;
const FOG_NIGHT_G = 0.05;
const FOG_NIGHT_B = 0.08;
const FOG_DENSITY_DAY = SKY_DEFAULTS.fogDensity;
const FOG_DAYLIGHT_NIGHT = VISUAL.sky.revealLighting.nightSky;

function fogDensityForDaylight(daylight: number): number {
  const fogDay = Math.max(0.05, daylight);
  return FOG_DENSITY_DAY * (0.35 + 0.65 * fogDay * fogDay);
}

/** Runtime aerial fog density for a daylight factor (used by dev panel sync). */
export function aerialFogDensityForDaylight(daylight: number): number {
  return fogDensityForDaylight(daylight);
}

function applyFogForDaylight(
  uFogColor: { value: Color },
  uFogDensity: { value: number },
  daylight: number,
): void {
  const fogT = MathUtils.smoothstep(daylight, FOG_DAYLIGHT_NIGHT, 1);
  uFogColor.value.r = MathUtils.lerp(FOG_NIGHT_R, FOG_R, fogT);
  uFogColor.value.g = MathUtils.lerp(FOG_NIGHT_G, FOG_G, fogT);
  uFogColor.value.b = MathUtils.lerp(FOG_NIGHT_B, FOG_B, fogT);
  uFogDensity.value = fogDensityForDaylight(daylight);
}

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

export function initSkySystem(
  scene: Scene,
  cloudTexture: Texture,
  nightHdri: NightHdriAssets | null = null,
): SkySystemContext {
  const solidBackground = new Color(SKY_BACKGROUND);
  scene.background = solidBackground;

  const skyMesh = new SkyMesh();
  skyMesh.scale.setScalar(CAMERA_FAR * 0.9);
  applySkyMeshDefaults(skyMesh);
  const skyMaterial = skyMesh.material as NodeMaterial;
  skyMaterial.fog = false;
  /** Preetham dome alpha for HDRI crossfade (0 = HDRI only, 1 = full SkyMesh). */
  const uPreethamWeight = uniform(nightHdri ? 0 : 1);
  /** Independent sky luminance scale — decoupled from global AgX exposure. */
  const uSkyExposure = uniform(1);
  const baseSkyColor = skyMaterial.colorNode;
  if (baseSkyColor) {
    skyMaterial.transparent = !!nightHdri;
    skyMaterial.colorNode = mul(
      baseSkyColor as never,
      vec4(uSkyExposure, uSkyExposure, uSkyExposure, uPreethamWeight),
    );
  }
  scene.add(skyMesh);

  const cloudSystem = createCloudSystem(cloudTexture);
  cloudSystem.group.visible = USE_HORIZON_CLOUDS;
  if (USE_HORIZON_CLOUDS) {
    scene.add(cloudSystem.group);
  }

  const uFogColor = uniform(new Color(FOG_R, FOG_G, FOG_B));
  const uFogDensity = uniform(FOG_DENSITY_DAY);
  scene.fogNode = fog(uFogColor, densityFogFactor(uFogDensity));

  let daylight = 0.12;
  let debugSkyLogged = false;
  let skyHiddenByDebug = false;
  let gameplayHdriWeight = 1;
  let hdriWeight = nightHdri ? 1 : 0;
  let lastHdriPresentationWeight = Number.NaN;
  let lastHdriIntensity = Number.NaN;
  let lastHdriRotationY = Number.NaN;
  const HDRI_WEIGHT_EPSILON = 1e-5;

  const applyDaylight = () => {
    applyFogForDaylight(uFogColor, uFogDensity, daylight);
  };

  const applyHdriPresentation = (weight: number, force = false) => {
    hdriWeight = Math.max(0, Math.min(1, weight));
    if (!nightHdri) {
      skyMesh.visible = true;
      uPreethamWeight.value = 1;
      return;
    }

    const { intensity: baseIntensity, rotationY } = nightHdriRuntime.getNightHdriTuning();
    if (
      !force &&
      Number.isFinite(lastHdriPresentationWeight) &&
      Math.abs(hdriWeight - lastHdriPresentationWeight) < HDRI_WEIGHT_EPSILON &&
      baseIntensity === lastHdriIntensity &&
      rotationY === lastHdriRotationY
    ) {
      return;
    }
    lastHdriPresentationWeight = hdriWeight;
    lastHdriIntensity = baseIntensity;
    lastHdriRotationY = rotationY;
    _bgRotation.set(0, rotationY, 0, 'YXZ');
    const intensity = hdriWeight * baseIntensity;
    const showHdriBg = hdriWeight > 1e-4;

    scene.environment = nightHdri.envMap;
    scene.environmentIntensity = intensity;

    if (showHdriBg) {
      scene.background = nightHdri.equirectTexture;
      scene.backgroundIntensity = intensity;
      scene.backgroundRotation.copy(_bgRotation);
    } else {
      scene.background = solidBackground;
      scene.backgroundIntensity = 1;
    }

    const crossfade = VISUAL.sky.nightHdri.crossfadeSkyMesh;
    const preethamWeight = crossfade ? 1 - hdriWeight : hdriWeight <= 0 ? 1 : 0;
    uPreethamWeight.value = preethamWeight;
    skyMesh.visible = preethamWeight > 1e-3;
  };

  if (nightHdri) {
    applyHdriPresentation(1);
  } else {
    skyMesh.visible = true;
  }

  const sky: SkyBackgroundHandle = {
    get visible() {
      return !skyHiddenByDebug;
    },
    set visible(value: boolean) {
      skyHiddenByDebug = !value;
      if (skyHiddenByDebug) {
        applyHdriPresentation(0, true);
        skyMesh.visible = false;
      } else {
        applyHdriPresentation(gameplayHdriWeight, true);
      }
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
    getDaylight() {
      return daylight;
    },
    setSkyParams(params: SkyParams) {
      if (params.turbidity !== undefined) skyMesh.turbidity.value = params.turbidity;
      if (params.rayleigh !== undefined) skyMesh.rayleigh.value = params.rayleigh;
      if (params.mieCoefficient !== undefined) skyMesh.mieCoefficient.value = params.mieCoefficient;
      if (params.mieDirectionalG !== undefined)
        skyMesh.mieDirectionalG.value = params.mieDirectionalG;
      if (params.cloudCoverage !== undefined) skyMesh.cloudCoverage.value = params.cloudCoverage;
      if (params.cloudDensity !== undefined) skyMesh.cloudDensity.value = params.cloudDensity;
      if (params.cloudElevation !== undefined) skyMesh.cloudElevation.value = params.cloudElevation;
      if (params.showSunDisc !== undefined) skyMesh.showSunDisc.value = params.showSunDisc;
      // fogDensity: dev-panel override only — runtime fog is driven by setDaylight / applyFogForDaylight
      if (params.fogDensity !== undefined) uFogDensity.value = params.fogDensity;
    },
    setSkyExposure(factor) {
      uSkyExposure.value = Math.max(0, factor);
    },
    setNightHdriWeight(weight: number) {
      gameplayHdriWeight = weight;
      if (skyHiddenByDebug) return;
      applyHdriPresentation(weight);
    },
    hasNightHdri: nightHdri !== null,
    getNightHdriTuning: nightHdriRuntime.getNightHdriTuning,
    setNightHdriTuning: (partial) => {
      nightHdriRuntime.setNightHdriTuning(partial);
      if (skyHiddenByDebug) return;
      applyHdriPresentation(gameplayHdriWeight, true);
    },
    resetNightHdriTuning: () => {
      nightHdriRuntime.resetNightHdriTuning();
      if (skyHiddenByDebug) return;
      applyHdriPresentation(gameplayHdriWeight, true);
    },
    dispose() {
      scene.fogNode = null;
      scene.background = solidBackground;
      scene.backgroundIntensity = 1;
      scene.environment = null;
      scene.environmentIntensity = 1;
      scene.remove(skyMesh);
      if (USE_HORIZON_CLOUDS) scene.remove(cloudSystem.group);
      cloudSystem.dispose();
      cloudTexture.dispose();
      nightHdri?.dispose();
    },
  };
}
