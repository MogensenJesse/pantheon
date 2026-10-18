// src/core/settings.ts — the DEV and render settings: runtime tuning, debug switches and the combined
// `devSettings` the DEV panels use. Gameplay state is in `state/gameState.ts` and is not exported here,
// so game code that only needs `state` does not pull the render settings in.

export { devDebugSettings } from './state/devDebugSettings';
export { runtimeSettings } from './state/runtimeSettings';
export type {
  DevDebugSettings,
  DevSettings,
  GrassDevSettings,
  GrassFoliageLightingSettings,
  GrassRingTune,
  PostFxDevSettings,
  PostFxGradeDevSettings,
  RenderDebugSettings,
  RuntimeSettings,
  TerrainDevSettings,
  WaterDevSettings,
  WaterShoreDevSettings,
  WaterTideDevSettings,
} from './state/settingsTypes';

import { devDebugSettings } from './state/devDebugSettings';
import { runtimeSettings } from './state/runtimeSettings';
import type { DevSettings } from './state/settingsTypes';

/**
 * Flat combined live settings for DEV panels.
 * Primitive debug fields are getter-linked; nested runtime objects are shared by reference.
 */
export const devSettings: DevSettings = {
  get movementSpeedMultiplier() {
    return devDebugSettings.movementSpeedMultiplier;
  },
  set movementSpeedMultiplier(value: number) {
    devDebugSettings.movementSpeedMultiplier = value;
  },
  get showFpsCounter() {
    return devDebugSettings.showFpsCounter;
  },
  set showFpsCounter(value: boolean) {
    devDebugSettings.showFpsCounter = value;
  },
  get showThreeInspector() {
    return devDebugSettings.showThreeInspector;
  },
  set showThreeInspector(value: boolean) {
    devDebugSettings.showThreeInspector = value;
  },
  get unconstrainedCameraPitch() {
    return devDebugSettings.unconstrainedCameraPitch;
  },
  set unconstrainedCameraPitch(value: boolean) {
    devDebugSettings.unconstrainedCameraPitch = value;
  },
  renderDebug: devDebugSettings.renderDebug,
  terrain: runtimeSettings.terrain,
  water: runtimeSettings.water,
  grass: runtimeSettings.grass,
  postfx: runtimeSettings.postfx,
};
