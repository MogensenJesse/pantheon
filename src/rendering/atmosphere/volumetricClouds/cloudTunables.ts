// src/rendering/atmosphere/volumetricClouds/cloudTunables.ts — types mirroring VISUAL.sky.volumetricClouds
import { VISUAL } from '../../../config/visualTuning';

/** Shipped + runtime volumetric cloud tunables (see visualTuning.ts). */
export interface CloudTunables {
  enabled: boolean;
  volumeHalfExtentM: number;
  baseHeightM: number;
  topHeightM: number;
  windSpeed: number;
  viewStepsMax: number;
  viewStepsMin: number;
  lightSteps: number;
  density: number;
  coverage: number;
  shadowMapSize: number;
  shadowStrength: number;
  skymeshCloudFade: number;
}

export function defaultCloudTunables(): CloudTunables {
  const c = VISUAL.sky.volumetricClouds;
  return {
    enabled: c.enabled,
    volumeHalfExtentM: c.volumeHalfExtentM,
    baseHeightM: c.baseHeightM,
    topHeightM: c.topHeightM,
    windSpeed: c.windSpeed,
    viewStepsMax: c.viewStepsMax,
    viewStepsMin: c.viewStepsMin,
    lightSteps: c.lightSteps,
    density: c.density,
    coverage: c.coverage,
    shadowMapSize: c.shadowMapSize,
    shadowStrength: c.shadowStrength,
    skymeshCloudFade: c.skymeshCloudFade,
  };
}
