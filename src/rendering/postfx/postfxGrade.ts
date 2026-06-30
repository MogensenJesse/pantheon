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

function lerpEndpoints(atNoon: number, atGoldenHour: number, t: number): number {
  return MathUtils.lerp(atNoon, atGoldenHour, t);
}

/** Live grade config — DEV panel writes devSettings; production uses VISUAL. */
export function getActivePostFxGrade(): PostFxGradeConfig {
  if (import.meta.env.DEV) {
    const d = devSettings.postfx.grade;
    return {
      enabled: d.enabled,
      saturation: d.saturation,
      contrast: d.contrast,
      lift: { r: d.liftR, g: d.liftG, b: d.liftB },
      elevation: {
        saturation: {
          atNoon: d.elevationSaturationAtNoon,
          atGoldenHour: d.elevationSaturationAtGoldenHour,
        },
        contrast: {
          atNoon: d.elevationContrastAtNoon,
          atGoldenHour: d.elevationContrastAtGoldenHour,
        },
        warmth: {
          atNoon: d.elevationWarmthAtNoon,
          atGoldenHour: d.elevationWarmthAtGoldenHour,
        },
      },
      warmthTint: d.warmthTint,
      lut: {
        enabled: d.lutEnabled,
        path: d.lutPath,
        size: d.lutSize,
        strength: d.lutStrength,
      },
    };
  }
  return VISUAL.postfx.grade;
}

/** Procedural grade scalars for the current sun elevation. */
export function samplePostFxGrade(elevationDeg: number): PostFxGradeSample {
  const grade = getActivePostFxGrade();
  const t = goldenHourT(elevationDeg);
  const elev = grade.elevation;
  return {
    enabled: grade.enabled ? 1 : 0,
    saturation: grade.saturation * lerpEndpoints(elev.saturation.atNoon, elev.saturation.atGoldenHour, t),
    contrast: grade.contrast * lerpEndpoints(elev.contrast.atNoon, elev.contrast.atGoldenHour, t),
    liftR: grade.lift.r,
    liftG: grade.lift.g,
    liftB: grade.lift.b,
    warmth: lerpEndpoints(elev.warmth.atNoon, elev.warmth.atGoldenHour, t),
    lutEnabled: grade.lut.enabled && grade.lut.path ? 1 : 0,
    lutStrength: grade.lut.strength,
  };
}
