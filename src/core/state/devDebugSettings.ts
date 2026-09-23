// src/core/state/devDebugSettings.ts — DEV-only debug toggles and test overrides

import type { DevDebugSettings } from './settingsTypes';

export const devDebugSettings: DevDebugSettings = {
  movementSpeedMultiplier: 1,
  showFpsCounter: false,
  showThreeInspector: false,
  unconstrainedCameraPitch: false,
  renderDebug: {
    hideTerrain: false,
    hideWater: false,
    hideMapProps: false,
    hideGrass: false,
    hideGrassLod0: false,
    hideGrassLod1: false,
    hideGrassLod2: false,
    hideGrassFlowers: false,
    hideSky: false,
    disableBloom: false,
    disableShadows: false,
    disableAa: false,
    disableGodRays: false,
    disableDof: false,
    disableGrade: false,
    disableFsr: false,
    disableValleyFog: false,
    disableDistanceHaze: false,
    disableShoreDepth: false,
    logGpuPeriodic: false,
  },
};
