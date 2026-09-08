// src/rendering/postfx/postfxGrade.ts — elevation-driven post-grade scalars + DEV reset
import { Color } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { type PostFxGradeDevSettings, runtimeSettings } from '../../core/GameState';
import type { PostFxGradeRegionScalars, PostFxGradeScalars } from '../PostFX';
import {
  dominantTodStop,
  sampleTodColor,
  sampleTodScalar,
  todWeights,
} from '../tod/todBlend';

export type PostFxGradeConfig = PostFxGradeDevSettings;

export interface PostFxGradeSample extends PostFxGradeScalars {
  enabled: number;
  shadows: PostFxGradeRegionScalars;
  midtones: PostFxGradeRegionScalars;
  highlights: PostFxGradeRegionScalars;
  warmth: number;
  warmthTint: string;
  lutEnabled: number;
  lutStrength: number;
}

function emptyRegion(): PostFxGradeRegionScalars {
  return { saturation: 1, contrast: 1, liftR: 0, liftG: 0, liftB: 0 };
}

const _GRADE_SAMPLE: PostFxGradeSample = {
  enabled: 0,
  shadows: emptyRegion(),
  midtones: emptyRegion(),
  highlights: emptyRegion(),
  warmth: 0,
  warmthTint: VISUAL.postfx.grade.stops.noon.warmthTint,
  lutEnabled: 0,
  lutStrength: 0,
};

const _warmthTint = new Color();

/** Live grade config — DEV mutates runtimeSettings; prod uses VISUAL. */
export function getActivePostFxGrade(): PostFxGradeConfig {
  if (import.meta.env.DEV) {
    return runtimeSettings.postfx.grade;
  }
  return VISUAL.postfx.grade as PostFxGradeConfig;
}

function sampleRegion(
  stops: PostFxGradeConfig['stops'],
  region: 'shadows' | 'midtones' | 'highlights',
  elevationDeg: number,
  out: PostFxGradeRegionScalars,
): void {
  const w = todWeights(elevationDeg);
  out.saturation = sampleTodScalar(
    {
      night: stops.night[region].saturation,
      goldenHour: stops.goldenHour[region].saturation,
      noon: stops.noon[region].saturation,
    },
    elevationDeg,
  );
  out.contrast = sampleTodScalar(
    {
      night: stops.night[region].contrast,
      goldenHour: stops.goldenHour[region].contrast,
      noon: stops.noon[region].contrast,
    },
    elevationDeg,
  );
  out.liftR =
    stops.night[region].lift.r * w.night +
    stops.goldenHour[region].lift.r * w.goldenHour +
    stops.noon[region].lift.r * w.noon;
  out.liftG =
    stops.night[region].lift.g * w.night +
    stops.goldenHour[region].lift.g * w.goldenHour +
    stops.noon[region].lift.g * w.noon;
  out.liftB =
    stops.night[region].lift.b * w.night +
    stops.goldenHour[region].lift.b * w.goldenHour +
    stops.noon[region].lift.b * w.noon;
}

/** Procedural grade scalars for the current sun elevation (3-stop todWeights). */
export function samplePostFxGrade(elevationDeg: number): PostFxGradeSample {
  const grade = getActivePostFxGrade();
  const { stops } = grade;

  _GRADE_SAMPLE.enabled = grade.enabled ? 1 : 0;
  sampleRegion(stops, 'shadows', elevationDeg, _GRADE_SAMPLE.shadows);
  sampleRegion(stops, 'midtones', elevationDeg, _GRADE_SAMPLE.midtones);
  sampleRegion(stops, 'highlights', elevationDeg, _GRADE_SAMPLE.highlights);

  _GRADE_SAMPLE.warmth = sampleTodScalar(
    {
      night: stops.night.warmth,
      goldenHour: stops.goldenHour.warmth,
      noon: stops.noon.warmth,
    },
    elevationDeg,
  );

  sampleTodColor(
    {
      night: stops.night.warmthTint,
      goldenHour: stops.goldenHour.warmthTint,
      noon: stops.noon.warmthTint,
    },
    elevationDeg,
    _warmthTint,
  );
  _GRADE_SAMPLE.warmthTint = `#${_warmthTint.getHexString()}`;

  const dominant = dominantTodStop(elevationDeg);
  const lutStop = stops[dominant].lut;
  _GRADE_SAMPLE.lutEnabled = lutStop.enabled && lutStop.path ? 1 : 0;
  _GRADE_SAMPLE.lutStrength = sampleTodScalar(
    {
      night: stops.night.lut.enabled ? stops.night.lut.strength : 0,
      goldenHour: stops.goldenHour.lut.enabled ? stops.goldenHour.lut.strength : 0,
      noon: stops.noon.lut.enabled ? stops.noon.lut.strength : 0,
    },
    elevationDeg,
  );
  return _GRADE_SAMPLE;
}

export function resetPostFxGradeDev(target: PostFxGradeDevSettings): void {
  const next = structuredClone(VISUAL.postfx.grade) as PostFxGradeDevSettings;
  target.enabled = next.enabled;
  target.stops = next.stops;
}
