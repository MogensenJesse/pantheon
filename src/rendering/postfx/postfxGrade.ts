// src/rendering/postfx/postfxGrade.ts — elevation-driven post-grade scalars
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { goldenHourT } from './postfxCohesion';

export interface PostFxGradeConfig {
  enabled: boolean;
  saturation: number;
  contrast: number;
  lift: { r: number; g: number; b: number };
  elevation: {
    saturation: { atNoon: number; atGoldenHour: number };
    contrast: { atNoon: number; atGoldenHour: number };
    warmth: { atNoon: number; atGoldenHour: number };
  };
  warmthTint: string;
  lut: {
    enabled: boolean;
    path: string | null;
    size: number;
    strength: number;
  };
}

export interface PostFxGradeSample {
  enabled: number;
  saturation: number;
  contrast: number;
  liftR: number;
  liftG: number;
  liftB: number;
  warmth: number;
  lutEnabled: number;
  lutStrength: number;
}

const _GRADE_SAMPLE: PostFxGradeSample = {
  enabled: 0,
  saturation: 1,
  contrast: 1,
  liftR: 0,
  liftG: 0,
  liftB: 0,
  warmth: 0,
  lutEnabled: 0,
  lutStrength: 0,
};

/** Live grade config — DEV panel writes devSettings; production uses VISUAL. */
export function getActivePostFxGrade(): PostFxGradeConfig {
  if (import.meta.env.DEV) {
    return devSettings.postfx.grade;
  }
  return VISUAL.postfx.grade;
}

/** Procedural grade scalars for the current sun elevation. */
export function samplePostFxGrade(elevationDeg: number): PostFxGradeSample {
  const grade = getActivePostFxGrade();
  const t = goldenHourT(elevationDeg);
  const elev = grade.elevation;
  _GRADE_SAMPLE.enabled = grade.enabled ? 1 : 0;
  _GRADE_SAMPLE.saturation =
    grade.saturation * MathUtils.lerp(elev.saturation.atNoon, elev.saturation.atGoldenHour, t);
  _GRADE_SAMPLE.contrast =
    grade.contrast * MathUtils.lerp(elev.contrast.atNoon, elev.contrast.atGoldenHour, t);
  _GRADE_SAMPLE.liftR = grade.lift.r;
  _GRADE_SAMPLE.liftG = grade.lift.g;
  _GRADE_SAMPLE.liftB = grade.lift.b;
  _GRADE_SAMPLE.warmth = MathUtils.lerp(elev.warmth.atNoon, elev.warmth.atGoldenHour, t);
  _GRADE_SAMPLE.lutEnabled = grade.lut.enabled && grade.lut.path ? 1 : 0;
  _GRADE_SAMPLE.lutStrength = grade.lut.strength;
  return _GRADE_SAMPLE;
}
