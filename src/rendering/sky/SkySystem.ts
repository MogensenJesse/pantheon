// src/rendering/sky/SkySystem.ts — Preetham SkyMesh atmosphere + night HDRI (+ optional dome clouds)
import {
  Color,
  type DirectionalLight,
  Euler,
  type PerspectiveCamera,
  type Scene,
  Vector2,
  Vector3,
} from 'three';
import { mul, uniform, vec4 } from 'three/tsl';
import type { NodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { enableWaterReflectionLayer } from '../../world/water/waterReflectionLayers';
import { getLiveCloudSettings } from '../clouds/cloudDevState';
import { CAMERA_FAR, SKY_BACKGROUND } from '../sceneConstants';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import type { NightHdriAssets } from './hdri/loadNightHdri';
import {
  createNightHdriBackgroundNode,
  createNightHdriHorizonDimUniforms,
  syncNightHdriHorizonDimUniforms,
} from './hdri/nightHdriBackgroundTsl';
import type { NightHdriTuning } from './hdri/nightHdriRuntime';
import * as nightHdriRuntime from './hdri/nightHdriRuntime';
import { SkyMesh } from './SkyMeshWithWind.js';
import { SKY_DEFAULTS } from './skyDefaults';

const _bgRotation = new Euler(0, 0, 0, 'YXZ');
const _cloudWindDir = new Vector2(1, 0);

/** Dev panel hide-sky toggles SkyMesh + night HDRI together. */
export type SkyBackgroundHandle = { visible: boolean };

export interface SkyParams {
  turbidity?: number;
  rayleigh?: number;
  mieCoefficient?: number;
  mieDirectionalG?: number;
  /** Preetham dome clouds — shipped on; tune via VISUAL.sky.static / DEV Clouds (SkyMesh). */
  cloudCoverage?: number;
  cloudDensity?: number;
  cloudElevation?: number;
  /** Dome UV scroll rate — independent of mesh windSpeed; direction follows mesh wind. */
  cloudSpeed?: number;
  showSunDisc?: number;
}

export interface SkySystemContext {
  sky: SkyBackgroundHandle;
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

function applySkyMeshDefaults(skyMesh: SkyMesh): void {
  skyMesh.turbidity.value = SKY_DEFAULTS.turbidity;
  skyMesh.rayleigh.value = SKY_DEFAULTS.rayleigh;
  skyMesh.mieCoefficient.value = SKY_DEFAULTS.mieCoefficient;
  skyMesh.mieDirectionalG.value = SKY_DEFAULTS.mieDirectionalG;
  skyMesh.cloudCoverage.value = SKY_DEFAULTS.cloudCoverage;
  skyMesh.cloudDensity.value = SKY_DEFAULTS.cloudDensity;
  skyMesh.cloudElevation.value = SKY_DEFAULTS.cloudElevation;
  skyMesh.cloudSpeed.value = SKY_DEFAULTS.cloudSpeed;
  skyMesh.showSunDisc.value = SKY_DEFAULTS.showSunDisc;
  syncSkyMeshCloudWindDir(skyMesh);
}

/** Dome scroll direction follows mesh wind; speed is VISUAL.sky.static.cloudSpeed / DEV. */
function syncSkyMeshCloudWindDir(skyMesh: SkyMesh): void {
  const { windDirectionDeg } = getLiveCloudSettings();
  const rad = (windDirectionDeg * Math.PI) / 180;
  // Negate vs mesh travel — SkyMesh UV scroll reads opposite to world XZ drift.
  _cloudWindDir.set(-Math.sin(rad), -Math.cos(rad));
  skyMesh.cloudWindDir.value.copy(_cloudWindDir);
}

export function initSkySystem(
  scene: Scene,
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
  enableWaterReflectionLayer(skyMesh);
  scene.add(skyMesh);

  let daylight = 0.12;
  let skyHiddenByDebug = false;
  let gameplayHdriWeight = 1;
  let hdriWeight = nightHdri ? 1 : 0;
  let lastHdriPresentationWeight = Number.NaN;
  let lastHdriIntensity = Number.NaN;
  let lastHdriRotationY = Number.NaN;
  const HDRI_WEIGHT_EPSILON = 1e-5;

  const horizonDimUniforms = nightHdri
    ? createNightHdriHorizonDimUniforms({
        dimStart: VISUAL.sky.nightHdri.horizonDim.start,
        dimEnd: VISUAL.sky.nightHdri.horizonDim.end,
        dimMin: VISUAL.sky.nightHdri.horizonDim.min,
      })
    : null;
  const nightHdriBackgroundNode =
    nightHdri && horizonDimUniforms
      ? createNightHdriBackgroundNode(nightHdri.equirectTexture, horizonDimUniforms)
      : null;

  const syncHorizonDimFromTuning = () => {
    if (!horizonDimUniforms) return;
    const { horizonDimStart, horizonDimEnd, horizonDimMin } = nightHdriRuntime.getNightHdriTuning();
    syncNightHdriHorizonDimUniforms(horizonDimUniforms, {
      dimStart: horizonDimStart,
      dimEnd: horizonDimEnd,
      dimMin: horizonDimMin,
    });
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
      syncHorizonDimFromTuning();
      scene.backgroundNode = nightHdriBackgroundNode;
      scene.background = null;
      scene.backgroundIntensity = intensity;
      scene.backgroundRotation.copy(_bgRotation);
    } else {
      scene.backgroundNode = null;
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

  return {
    sky,
    update(_sun, camera, _elapsed) {
      skyMesh.position.copy(camera.position);
      // Continuous reveal angles — DirectionalLight may be angle-quantized for stable shadows.
      sunDirectionFromSpherical(currentSunElevationDeg(), currentSunAzimuthDeg(), _sunDir);
      skyMesh.sunPosition.value.copy(_sunDir);
      syncSkyMeshCloudWindDir(skyMesh);
    },
    setDaylight(factor) {
      daylight = Math.max(0, Math.min(1, factor));
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
      if (params.cloudSpeed !== undefined) skyMesh.cloudSpeed.value = params.cloudSpeed;
      if (params.showSunDisc !== undefined) skyMesh.showSunDisc.value = params.showSunDisc;
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
      syncHorizonDimFromTuning();
      if (skyHiddenByDebug) return;
      applyHdriPresentation(gameplayHdriWeight, true);
    },
    resetNightHdriTuning: () => {
      nightHdriRuntime.resetNightHdriTuning();
      syncHorizonDimFromTuning();
      if (skyHiddenByDebug) return;
      applyHdriPresentation(gameplayHdriWeight, true);
    },
    dispose() {
      scene.backgroundNode = null;
      scene.background = solidBackground;
      scene.backgroundIntensity = 1;
      scene.environment = null;
      scene.environmentIntensity = 1;
      scene.remove(skyMesh);
      skyMesh.geometry.dispose();
      skyMesh.material.dispose();
      nightHdri?.dispose();
    },
  };
}
