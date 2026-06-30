// src/rendering/postfx/postfxGradeDevDefaults.ts — DEV grade tunables reset
import { VISUAL } from '../../config/visualTuning';
import type { PostFxGradeDevSettings } from '../../core/GameState';

const G = VISUAL.postfx.grade;

export const POSTFX_GRADE_DEV_DEFAULTS: PostFxGradeDevSettings = {
  enabled: G.enabled,
  saturation: G.saturation,
  contrast: G.contrast,
  liftR: G.lift.r,
  liftG: G.lift.g,
  liftB: G.lift.b,
  elevationSaturationAtNoon: G.elevation.saturation.atNoon,
  elevationSaturationAtGoldenHour: G.elevation.saturation.atGoldenHour,
  elevationContrastAtNoon: G.elevation.contrast.atNoon,
  elevationContrastAtGoldenHour: G.elevation.contrast.atGoldenHour,
  elevationWarmthAtNoon: G.elevation.warmth.atNoon,
  elevationWarmthAtGoldenHour: G.elevation.warmth.atGoldenHour,
  warmthTint: G.warmthTint,
  lutEnabled: G.lut.enabled,
  lutPath: G.lut.path,
  lutSize: G.lut.size,
  lutStrength: G.lut.strength,
};

export function resetPostFxGradeDev(target: PostFxGradeDevSettings): void {
  Object.assign(target, POSTFX_GRADE_DEV_DEFAULTS);
}
