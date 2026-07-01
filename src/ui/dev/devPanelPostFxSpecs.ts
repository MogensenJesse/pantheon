// src/ui/dev/devPanelPostFxSpecs.ts — RangeSpec tables for the Post FX dev panel
import { VISUAL } from '../../config/visualTuning';
import type { PostFxCohesionDevSettings, PostFxGradeDevSettings } from '../../core/GameState';
import type { RangeSpec } from './bindRange';

const C = VISUAL.postfx.cohesion;
const G = VISUAL.postfx.grade;

export interface CohesionSpec extends RangeSpec {
  key: keyof Pick<
    PostFxCohesionDevSettings,
    | 'goldenHourPower'
    | 'bloomSceneWeightAtNoon'
    | 'bloomSceneWeightAtGoldenHour'
    | 'godraysWeightAtNoon'
    | 'godraysWeightAtGoldenHour'
    | 'vignetteDarknessBleed'
  >;
}

export interface GradeSpec extends RangeSpec {
  key: keyof Pick<
    PostFxGradeDevSettings,
    | 'saturation'
    | 'contrast'
    | 'liftR'
    | 'liftG'
    | 'liftB'
    | 'elevationSaturationAtNoon'
    | 'elevationSaturationAtGoldenHour'
    | 'elevationContrastAtNoon'
    | 'elevationContrastAtGoldenHour'
    | 'elevationWarmthAtNoon'
    | 'elevationWarmthAtGoldenHour'
    | 'lutStrength'
  >;
}

export const COHESION_SPECS: CohesionSpec[] = [
  {
    id: 'dev-cohesion-golden-power',
    label: 'Golden hour sharpness',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: C.goldenHourPower,
    format: (v) => v.toFixed(2),
    key: 'goldenHourPower',
  },
  {
    id: 'dev-cohesion-bloom-noon',
    label: 'Scene bloom — noon',
    min: 0.5,
    max: 1.5,
    step: 0.02,
    defaultValue: C.bloomSceneWeight.atNoon,
    format: (v) => v.toFixed(2),
    key: 'bloomSceneWeightAtNoon',
  },
  {
    id: 'dev-cohesion-bloom-golden',
    label: 'Scene bloom — golden hour',
    min: 0.5,
    max: 1.5,
    step: 0.02,
    defaultValue: C.bloomSceneWeight.atGoldenHour,
    format: (v) => v.toFixed(2),
    key: 'bloomSceneWeightAtGoldenHour',
  },
  {
    id: 'dev-cohesion-rays-noon',
    label: 'God rays weight — noon',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: C.godraysWeight.atNoon,
    format: (v) => v.toFixed(2),
    key: 'godraysWeightAtNoon',
  },
  {
    id: 'dev-cohesion-rays-golden',
    label: 'God rays weight — golden hour',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: C.godraysWeight.atGoldenHour,
    format: (v) => v.toFixed(2),
    key: 'godraysWeightAtGoldenHour',
  },
  {
    id: 'dev-cohesion-vignette-bleed',
    label: 'Reveal vignette bleed',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: C.vignetteDarknessBleed,
    format: (v) => v.toFixed(2),
    key: 'vignetteDarknessBleed',
  },
];

export const GRADE_SPECS: GradeSpec[] = [
  {
    id: 'dev-grade-saturation',
    label: 'Saturation',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: G.saturation,
    format: (v) => v.toFixed(2),
    key: 'saturation',
  },
  {
    id: 'dev-grade-contrast',
    label: 'Contrast',
    min: 0.5,
    max: 2,
    step: 0.01,
    defaultValue: G.contrast,
    format: (v) => v.toFixed(2),
    key: 'contrast',
  },
  {
    id: 'dev-grade-lift',
    label: 'Lift (RGB)',
    min: -0.2,
    max: 0.2,
    step: 0.005,
    defaultValue: G.lift.r,
    format: (v) => v.toFixed(3),
    key: 'liftR',
  },
  {
    id: 'dev-grade-lift-g',
    label: 'Lift G',
    min: -0.2,
    max: 0.2,
    step: 0.005,
    defaultValue: G.lift.g,
    format: (v) => v.toFixed(3),
    key: 'liftG',
  },
  {
    id: 'dev-grade-lift-b',
    label: 'Lift B',
    min: -0.2,
    max: 0.2,
    step: 0.005,
    defaultValue: G.lift.b,
    format: (v) => v.toFixed(3),
    key: 'liftB',
  },
  {
    id: 'dev-grade-sat-noon',
    label: 'Elevation sat — noon',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.saturation.atNoon,
    format: (v) => v.toFixed(2),
    key: 'elevationSaturationAtNoon',
  },
  {
    id: 'dev-grade-sat-golden',
    label: 'Elevation sat — golden hour',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.saturation.atGoldenHour,
    format: (v) => v.toFixed(2),
    key: 'elevationSaturationAtGoldenHour',
  },
  {
    id: 'dev-grade-con-noon',
    label: 'Elevation contrast — noon',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.contrast.atNoon,
    format: (v) => v.toFixed(2),
    key: 'elevationContrastAtNoon',
  },
  {
    id: 'dev-grade-con-golden',
    label: 'Elevation contrast — golden hour',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.contrast.atGoldenHour,
    format: (v) => v.toFixed(2),
    key: 'elevationContrastAtGoldenHour',
  },
  {
    id: 'dev-grade-warm-noon',
    label: 'Warmth — noon',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: G.elevation.warmth.atNoon,
    format: (v) => v.toFixed(2),
    key: 'elevationWarmthAtNoon',
  },
  {
    id: 'dev-grade-warm-golden',
    label: 'Warmth — golden hour',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: G.elevation.warmth.atGoldenHour,
    format: (v) => v.toFixed(2),
    key: 'elevationWarmthAtGoldenHour',
  },
  {
    id: 'dev-grade-lut-strength',
    label: 'LUT strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.lut.strength,
    format: (v) => v.toFixed(2),
    key: 'lutStrength',
  },
];
