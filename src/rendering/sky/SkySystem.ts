// src/rendering/sky/SkySystem.ts — Preetham SkyMesh atmosphere + night HDRI / aurora
import {
  Color,
  type DirectionalLight,
  Euler,
  type PerspectiveCamera,
  type Scene,
  Vector3,
} from 'three';
import { mul, uniform, vec4 } from 'three/tsl';
import type { NodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import {
  applySkyHorizonHaze,
  getValleyFogSkyVolumeNode,
  getValleyFogUniforms,
} from '../atmosphere';
import { enableWaterReflectionLayer } from '../layers/waterReflectionLayers';
import { CAMERA_FAR, SKY_BACKGROUND } from '../sceneConstants';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import {
  createAuroraBackgroundNode,
  createAuroraBackgroundUniforms,
  syncAuroraBackgroundUniforms,
} from './aurora/auroraBackgroundTsl';
import type { AuroraTuning } from './aurora/auroraRuntime';
import * as auroraRuntime from './aurora/auroraRuntime';
import type { NightHdriAssets } from './hdri/loadNightHdri';
import {
  createNightHdriBackgroundNode,
  createNightHdriHorizonDimUniforms,
  syncNightHdriHorizonDimUniforms,
} from './hdri/nightHdriBackgroundTsl';
import type { NightHdriTuning } from './hdri/nightHdriRuntime';
import * as nightHdriRuntime from './hdri/nightHdriRuntime';
import { SkyMesh } from './SkyMesh.js';
import { SKY_DEFAULTS } from './skyDefaults';

const _bgRotation = new Euler(0, 0, 0, 'YXZ');

/** Dev panel hide-sky toggles SkyMesh + night HDRI / aurora together. */
export type SkyBackgroundHandle = { visible: boolean };

export interface SkyParams {
  turbidity?: number;
  rayleigh?: number;
  mieCoefficient?: number;
  mieDirectionalG?: number;
  showSunDisc?: number;
}

export interface SkySystemContext {
  sky: SkyBackgroundHandle;
  update: (sun: DirectionalLight, camera: PerspectiveCamera, elapsed: number) => void;
  setDaylight: (factor: number) => void;
  getDaylight: () => number;
  setSkyParams: (params: SkyParams) => void;
  setSkyExposure: (factor: number) => void;
  /** RGB multiply after exposure, before horizon haze. */
  setSkyTint: (tint: Color) => void;
  setNightHdriWeight: (weight: number) => void;
  hasNightHdri: boolean;
  getNightHdriTuning: () => Readonly<NightHdriTuning>;
  setNightHdriTuning: (partial: Partial<NightHdriTuning>) => void;
  resetNightHdriTuning: () => void;
  getAuroraTuning: () => Readonly<AuroraTuning>;
  setAuroraTuning: (partial: Partial<AuroraTuning>) => void;
  resetAuroraTuning: () => void;
  dispose: () => void;
}

const _sunDir = new Vector3();

function applySkyMeshDefaults(skyMesh: SkyMesh): void {
  skyMesh.turbidity.value = SKY_DEFAULTS.turbidity;
  skyMesh.rayleigh.value = SKY_DEFAULTS.rayleigh;
  skyMesh.mieCoefficient.value = SKY_DEFAULTS.mieCoefficient;
  skyMesh.mieDirectionalG.value = SKY_DEFAULTS.mieDirectionalG;
  skyMesh.showSunDisc.value = SKY_DEFAULTS.showSunDisc;
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
  /** Preetham dome alpha for night crossfade (0 = night bg only, 1 = full SkyMesh). */
  const uPreethamWeight = uniform(nightHdri || VISUAL.sky.nightAurora.enabled ? 0 : 1);
  /** Independent sky luminance scale — decoupled from global AgX exposure. */
  const uSkyExposure = uniform(1);
  /** Per-TOD RGB multiply (default white). */
  const uSkyTint = uniform(new Color(0xffffff));
  const baseSkyColor = skyMaterial.colorNode;
  if (baseSkyColor) {
    skyMaterial.transparent = !!(nightHdri || VISUAL.sky.nightAurora.enabled);
    const exposed = mul(
      baseSkyColor as never,
      vec4(uSkyExposure, uSkyExposure, uSkyExposure, uPreethamWeight),
    );
    const tinted = mul((exposed as any).xyz, uSkyTint as any);
    const fogU = getValleyFogUniforms();
    const nightVolume = getValleyFogSkyVolumeNode();
    if (!fogU || !nightVolume) {
      throw new Error('initSkySystem requires initValleyFog first (horizon haze).');
    }
    const hazedRgb = applySkyHorizonHaze(
      tinted,
      fogU.uFogColor as any,
      fogU.uSkyHorizonStrength,
      nightVolume,
      fogU.uSkyHorizonStart,
      fogU.uSkyHorizonEnd,
    );
    skyMaterial.colorNode = vec4(hazedRgb, (exposed as any).w);
  }
  enableWaterReflectionLayer(skyMesh);
  scene.add(skyMesh);

  let daylight = 0.12;
  let skyHiddenByDebug = false;
  let gameplayHdriWeight = 1;
  let hdriWeight = nightHdri || VISUAL.sky.nightAurora.enabled ? 1 : 0;
  let lastHdriPresentationWeight = Number.NaN;
  let lastHdriIntensity = Number.NaN;
  let lastHdriRotationY = Number.NaN;
  let lastAuroraEnabled = false;
  let lastAuroraIntensity = Number.NaN;
  let lastAuroraStrength = Number.NaN;
  let lastStarStrength = Number.NaN;
  let lastTimeScale = Number.NaN;
  const HDRI_WEIGHT_EPSILON = 1e-5;

  const horizonDimUniforms = nightHdri
    ? createNightHdriHorizonDimUniforms({
        dimStart: VISUAL.sky.nightHdri.horizonDim.start,
        dimEnd: VISUAL.sky.nightHdri.horizonDim.end,
        dimMin: VISUAL.sky.nightHdri.horizonDim.min,
      })
    : null;
  /** Folded into the HDRI node before fog mix; `scene.backgroundIntensity` stays 1. */
  const uHdriIntensity = uniform(1);
  const nightHdriBackgroundNode =
    nightHdri && horizonDimUniforms
      ? createNightHdriBackgroundNode(nightHdri.equirectTexture, horizonDimUniforms, uHdriIntensity)
      : null;

  const auroraUniforms = createAuroraBackgroundUniforms({
    intensity: VISUAL.sky.nightAurora.intensity,
    auroraStrength: VISUAL.sky.nightAurora.auroraStrength,
    starStrength: VISUAL.sky.nightAurora.starStrength,
    timeScale: VISUAL.sky.nightAurora.timeScale,
  });
  const auroraBackgroundNode = createAuroraBackgroundNode(auroraUniforms);

  const syncHorizonDimFromTuning = () => {
    if (!horizonDimUniforms) return;
    const { horizonDimStart, horizonDimEnd, horizonDimMin } = nightHdriRuntime.getNightHdriTuning();
    syncNightHdriHorizonDimUniforms(horizonDimUniforms, {
      dimStart: horizonDimStart,
      dimEnd: horizonDimEnd,
      dimMin: horizonDimMin,
    });
  };

  const syncAuroraFromTuning = (presentationIntensity: number) => {
    const t = auroraRuntime.getAuroraTuning();
    syncAuroraBackgroundUniforms(auroraUniforms, {
      intensity: presentationIntensity,
      auroraStrength: t.auroraStrength,
      starStrength: t.starStrength,
      timeScale: t.timeScale,
    });
  };

  const applyHdriPresentation = (weight: number, force = false) => {
    hdriWeight = Math.max(0, Math.min(1, weight));
    const auroraTuning = auroraRuntime.getAuroraTuning();
    const useAurora = auroraTuning.enabled;
    const hasNightPresentation = nightHdri !== null || useAurora;

    if (!hasNightPresentation) {
      skyMesh.visible = true;
      uPreethamWeight.value = 1;
      scene.backgroundNode = null;
      scene.background = solidBackground;
      scene.backgroundIntensity = 1;
      scene.environment = null;
      scene.environmentIntensity = 1;
      return;
    }

    const { intensity: hdriBaseIntensity, rotationY } = nightHdri
      ? nightHdriRuntime.getNightHdriTuning()
      : { intensity: 1, rotationY: 0 };

    if (
      !force &&
      Number.isFinite(lastHdriPresentationWeight) &&
      Math.abs(hdriWeight - lastHdriPresentationWeight) < HDRI_WEIGHT_EPSILON &&
      hdriBaseIntensity === lastHdriIntensity &&
      rotationY === lastHdriRotationY &&
      useAurora === lastAuroraEnabled &&
      auroraTuning.intensity === lastAuroraIntensity &&
      auroraTuning.auroraStrength === lastAuroraStrength &&
      auroraTuning.starStrength === lastStarStrength &&
      auroraTuning.timeScale === lastTimeScale
    ) {
      return;
    }
    lastHdriPresentationWeight = hdriWeight;
    lastHdriIntensity = hdriBaseIntensity;
    lastHdriRotationY = rotationY;
    lastAuroraEnabled = useAurora;
    lastAuroraIntensity = auroraTuning.intensity;
    lastAuroraStrength = auroraTuning.auroraStrength;
    lastStarStrength = auroraTuning.starStrength;
    lastTimeScale = auroraTuning.timeScale;

    _bgRotation.set(0, rotationY, 0, 'YXZ');
    const showNightBg = hdriWeight > 1e-4;

    if (nightHdri) {
      scene.environment = nightHdri.envMap;
      scene.environmentIntensity = hdriWeight * hdriBaseIntensity;
    } else {
      scene.environment = null;
      scene.environmentIntensity = 1;
    }

    if (showNightBg) {
      if (useAurora) {
        syncAuroraFromTuning(hdriWeight * auroraTuning.intensity);
        scene.backgroundNode = auroraBackgroundNode;
        scene.background = null;
        scene.backgroundIntensity = 1;
      } else if (nightHdriBackgroundNode) {
        syncHorizonDimFromTuning();
        uHdriIntensity.value = hdriWeight * hdriBaseIntensity;
        scene.backgroundNode = nightHdriBackgroundNode;
        scene.background = null;
        scene.backgroundIntensity = 1;
        scene.backgroundRotation.copy(_bgRotation);
      } else {
        scene.backgroundNode = null;
        scene.background = solidBackground;
        scene.backgroundIntensity = 1;
      }
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

  if (nightHdri || VISUAL.sky.nightAurora.enabled) {
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
      if (params.showSunDisc !== undefined) skyMesh.showSunDisc.value = params.showSunDisc;
    },
    setSkyExposure(factor) {
      uSkyExposure.value = Math.max(0, factor);
    },
    setSkyTint(tint) {
      (uSkyTint.value as Color).copy(tint);
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
    getAuroraTuning: auroraRuntime.getAuroraTuning,
    setAuroraTuning: (partial) => {
      auroraRuntime.setAuroraTuning(partial);
      if (skyHiddenByDebug) return;
      applyHdriPresentation(gameplayHdriWeight, true);
    },
    resetAuroraTuning: () => {
      auroraRuntime.resetAuroraTuning();
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
