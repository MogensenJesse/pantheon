// src/core/state/devDebugSettings.ts — DEV-only debug toggles and test overrides

import { VISUAL } from '../../config/visualTuning';
import type { DevDebugSettings, GodraysHorizonDevSettings } from './settingsTypes';

function createGodraysHorizonSettings(): GodraysHorizonDevSettings {
  const h = VISUAL.godrays.horizonOcclusion;
  return {
    enabled: true,
    maxDistanceM: h.maxDistanceM,
    sampleCount: h.sampleCount,
    rayFanCount: h.rayFanCount,
    rayFanSpreadDeg: h.rayFanSpreadDeg,
    smoothRatePerSec: h.smoothRatePerSec,
    hardOccludeMarginDeg: h.hardOccludeMarginDeg,
  };
}

export const devDebugSettings: DevDebugSettings = {
  movementSpeedMultiplier: 1,
  showFpsCounter: false,
  unconstrainedCameraPitch: false,
  godraysHorizon: createGodraysHorizonSettings(),
  renderDebug: {
    hideTerrain: false,
    hideWater: false,
    hideMapProps: false,
    hideGrass: false,
    hideSky: false,
    hideClouds: false,
    disableBloom: false,
    disableShadows: false,
    disableAa: false,
    disableGodRays: false,
    disableDof: false,
    disableGrade: false,
    disableFsr: false,
    disableHaze: false,
    disableShoreDepth: false,
    logGpuPeriodic: false,
  },
};
