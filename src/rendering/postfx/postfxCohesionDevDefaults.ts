// src/rendering/postfx/postfxCohesionDevDefaults.ts — DEV cohesion tunables reset
import { VISUAL } from '../../config/visualTuning';
import type { PostFxCohesionDevSettings } from '../../core/GameState';

export const POSTFX_COHESION_DEV_DEFAULTS: PostFxCohesionDevSettings = {
  enabled: VISUAL.postfx.cohesion.enabled,
  goldenHourPower: VISUAL.postfx.cohesion.goldenHourPower,
  bloomSceneWeightAtNoon: VISUAL.postfx.cohesion.bloomSceneWeight.atNoon,
  bloomSceneWeightAtGoldenHour: VISUAL.postfx.cohesion.bloomSceneWeight.atGoldenHour,
  godraysWeightAtNoon: VISUAL.postfx.cohesion.godraysWeight.atNoon,
  godraysWeightAtGoldenHour: VISUAL.postfx.cohesion.godraysWeight.atGoldenHour,
  vignetteDarknessBleed: VISUAL.postfx.cohesion.vignetteDarknessBleed,
};

export function resetPostFxCohesionDev(target: PostFxCohesionDevSettings): void {
  Object.assign(target, POSTFX_COHESION_DEV_DEFAULTS);
}
