// src/core/GameState.ts — barrel: gameplay state + runtime/debug settings

export { devDebugSettings } from './state/devDebugSettings';
export { createGameState, type GameState, state } from './state/gameState';
export { runtimeSettings } from './state/runtimeSettings';
export type {
  DevDebugSettings,
  DevSettings,
  GodraysHorizonDevSettings,
  GrassDevSettings,
  GrassFoliageLightingSettings,
  GrassRingDerivedLayout,
  GrassRingTune,
  PostFxCohesionDevSettings,
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
  godraysHorizon: devDebugSettings.godraysHorizon,
  renderDebug: devDebugSettings.renderDebug,
  terrain: runtimeSettings.terrain,
  water: runtimeSettings.water,
  grass: runtimeSettings.grass,
  postfx: runtimeSettings.postfx,
};
