// src/rendering/atmosphere/volumetricClouds/controls/createCloudControls.ts — cloud march RTT + sun-driven weight
import type { DirectionalLight, PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import { rtt, uniform } from 'three/tsl';
import { VISUAL } from '../../../../config/visualTuning';
import { devSettings } from '../../../../core/GameState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../../../sunSpherical';
import { getCloudAabb } from '../cloudVolume';
import type { VolumetricCloudContext } from '../index';
import { CLOUD_LAYER_PASSTHROUGH } from '../tsl/cloudCompositeTsl';
import {
  createCloudMarchColorNode,
  createCloudMarchUniforms,
  syncCloudMarchUniforms,
} from '../tsl/cloudMarchTsl';

const _boundsMin = new Vector3();
const _boundsMax = new Vector3();
const _sunDir = new Vector3();
const _sunColor = new Vector3(1, 1, 1);

interface RttNodeWithResolutionScale {
  setResolutionScale: (scale: number) => void;
  sample: (uv: unknown) => unknown;
}

export interface CloudControls {
  cloudScatterNode: RttNodeWithResolutionScale | typeof CLOUD_LAYER_PASSTHROUGH;
  uCloudWeight: ReturnType<typeof uniform>;
  updateFrame: (frame: number, daylight: number) => void;
  updateFromSun: (intensity: number, elevationDeg: number, daylight: number) => void;
  applyWeight: () => void;
  setResolutionScale: (scale: number) => void;
  dispose: () => void;
}

function cloudWeightForSun(elevationDeg: number, daylight: number): number {
  const fadeStart = VISUAL.sky.nightHdri.fadeElevationEnd;
  const fadeEnd = VISUAL.sky.nightHdri.fadeElevationStart;
  const t = Math.max(0, Math.min(1, (elevationDeg - fadeEnd) / (fadeStart - fadeEnd)));
  return t * Math.max(0.15, daylight);
}

function createDisabledCloudControls(uCloudWeight: ReturnType<typeof uniform>): CloudControls {
  return {
    cloudScatterNode: CLOUD_LAYER_PASSTHROUGH,
    uCloudWeight,
    updateFrame: () => {},
    updateFromSun: () => {
      uCloudWeight.value = 0;
    },
    applyWeight: () => {
      uCloudWeight.value = 0;
    },
    setResolutionScale: () => {},
    dispose: () => {},
  };
}

export function createCloudControls(
  sceneDepth: unknown,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
  cloudCtx: VolumetricCloudContext | null,
): CloudControls {
  const uCloudWeight = uniform(0);

  if (!cloudCtx || !VISUAL.sky.volumetricClouds.enabled) {
    return createDisabledCloudControls(uCloudWeight);
  }

  const marchUniforms = createCloudMarchUniforms();
  const marchFn = createCloudMarchColorNode({
    sceneDepth,
    camera,
    marchUniforms,
    sampleCloudDensity: cloudCtx.sampleCloudDensity,
  });

  const cloudScatterRtt = rtt(marchFn()) as RttNodeWithResolutionScale;

  let lastSunWeight = 0;
  let lastFrame = 0;

  const syncBounds = () => {
    const { min, max } = getCloudAabb(_boundsMin, _boundsMax);
    syncCloudMarchUniforms(
      marchUniforms,
      min,
      max,
      _sunDir,
      _sunColor,
      sun.intensity,
      VISUAL.sky.lightingCurve.ambientMin,
      lastFrame,
    );
  };

  return {
    cloudScatterNode: cloudScatterRtt,
    uCloudWeight,
    updateFrame: (frame, daylight) => {
      lastFrame = frame;
      sunDirectionFromSpherical(currentSunElevationDeg(), currentSunAzimuthDeg(), _sunDir);
      _sunColor.set(sun.color.r, sun.color.g, sun.color.b);
      const { min, max } = getCloudAabb(_boundsMin, _boundsMax);
      syncCloudMarchUniforms(
        marchUniforms,
        min,
        max,
        _sunDir,
        _sunColor,
        sun.intensity,
        Math.max(
          VISUAL.sky.lightingCurve.ambientMin,
          daylight * VISUAL.sky.lightingCurve.ambientMax,
        ),
        frame,
      );
    },
    updateFromSun: (_intensity, elevationDeg, daylight) => {
      sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
      _sunColor.set(sun.color.r, sun.color.g, sun.color.b);
      lastSunWeight = cloudWeightForSun(elevationDeg, daylight);
      syncBounds();
    },
    applyWeight: () => {
      if (
        import.meta.env.DEV &&
        (devSettings.renderDebug.disableVolumetricClouds || devSettings.renderDebug.hideSky)
      ) {
        uCloudWeight.value = 0;
        return;
      }
      uCloudWeight.value = lastSunWeight;
    },
    setResolutionScale: (scale) => {
      cloudScatterRtt.setResolutionScale(scale);
    },
    dispose: () => {},
  };
}

export function disposeActiveCloudControls(): void {}
