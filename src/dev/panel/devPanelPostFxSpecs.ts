// src/dev/panel/devPanelPostFxSpecs.ts — RangeSpec tables for the Post FX dev panel
import { VISUAL } from '../../config/visualTuning';
import type { PostFxCohesionDevSettings, PostFxGradeDevSettings } from '../../core/GameState';
import type { RangeSpec } from '../bindRange';

const C = VISUAL.postfx.cohesion;
const G = VISUAL.postfx.grade;

export interface CohesionSpec extends RangeSpec {
  read: (c: PostFxCohesionDevSettings) => number;
  write: (c: PostFxCohesionDevSettings, v: number) => void;
}

export interface GradeSpec extends RangeSpec {
  read: (g: PostFxGradeDevSettings) => number;
  write: (g: PostFxGradeDevSettings, v: number) => void;
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
    read: (c) => c.goldenHourPower,
    write: (c, v) => {
      c.goldenHourPower = v;
    },
  },
  {
    id: 'dev-cohesion-bloom-noon',
    label: 'Scene bloom — noon',
    min: 0.5,
    max: 1.5,
    step: 0.02,
    defaultValue: C.bloomSceneWeight.atNoon,
    format: (v) => v.toFixed(2),
    read: (c) => c.bloomSceneWeight.atNoon,
    write: (c, v) => {
      c.bloomSceneWeight.atNoon = v;
    },
  },
  {
    id: 'dev-cohesion-bloom-golden',
    label: 'Scene bloom — golden hour',
    min: 0.5,
    max: 1.5,
    step: 0.02,
    defaultValue: C.bloomSceneWeight.atGoldenHour,
    format: (v) => v.toFixed(2),
    read: (c) => c.bloomSceneWeight.atGoldenHour,
    write: (c, v) => {
      c.bloomSceneWeight.atGoldenHour = v;
    },
  },
  {
    id: 'dev-cohesion-rays-noon',
    label: 'God rays weight — noon',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: C.godraysWeight.atNoon,
    format: (v) => v.toFixed(2),
    read: (c) => c.godraysWeight.atNoon,
    write: (c, v) => {
      c.godraysWeight.atNoon = v;
    },
  },
  {
    id: 'dev-cohesion-rays-golden',
    label: 'God rays weight — golden hour',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: C.godraysWeight.atGoldenHour,
    format: (v) => v.toFixed(2),
    read: (c) => c.godraysWeight.atGoldenHour,
    write: (c, v) => {
      c.godraysWeight.atGoldenHour = v;
    },
  },
  {
    id: 'dev-cohesion-vignette-bleed',
    label: 'Reveal vignette bleed',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: C.vignetteDarknessBleed,
    format: (v) => v.toFixed(2),
    read: (c) => c.vignetteDarknessBleed,
    write: (c, v) => {
      c.vignetteDarknessBleed = v;
    },
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
    read: (g) => g.saturation,
    write: (g, v) => {
      g.saturation = v;
    },
  },
  {
    id: 'dev-grade-contrast',
    label: 'Contrast',
    min: 0.5,
    max: 2,
    step: 0.01,
    defaultValue: G.contrast,
    format: (v) => v.toFixed(2),
    read: (g) => g.contrast,
    write: (g, v) => {
      g.contrast = v;
    },
  },
  {
    id: 'dev-grade-lift',
    label: 'Lift (RGB)',
    min: -0.2,
    max: 0.2,
    step: 0.005,
    defaultValue: G.lift.r,
    format: (v) => v.toFixed(3),
    read: (g) => g.lift.r,
    write: (g, v) => {
      g.lift.r = v;
    },
  },
  {
    id: 'dev-grade-lift-g',
    label: 'Lift G',
    min: -0.2,
    max: 0.2,
    step: 0.005,
    defaultValue: G.lift.g,
    format: (v) => v.toFixed(3),
    read: (g) => g.lift.g,
    write: (g, v) => {
      g.lift.g = v;
    },
  },
  {
    id: 'dev-grade-lift-b',
    label: 'Lift B',
    min: -0.2,
    max: 0.2,
    step: 0.005,
    defaultValue: G.lift.b,
    format: (v) => v.toFixed(3),
    read: (g) => g.lift.b,
    write: (g, v) => {
      g.lift.b = v;
    },
  },
  {
    id: 'dev-grade-sat-noon',
    label: 'Elevation sat — noon',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.saturation.atNoon,
    format: (v) => v.toFixed(2),
    read: (g) => g.elevation.saturation.atNoon,
    write: (g, v) => {
      g.elevation.saturation.atNoon = v;
    },
  },
  {
    id: 'dev-grade-sat-golden',
    label: 'Elevation sat — golden hour',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.saturation.atGoldenHour,
    format: (v) => v.toFixed(2),
    read: (g) => g.elevation.saturation.atGoldenHour,
    write: (g, v) => {
      g.elevation.saturation.atGoldenHour = v;
    },
  },
  {
    id: 'dev-grade-con-noon',
    label: 'Elevation contrast — noon',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.contrast.atNoon,
    format: (v) => v.toFixed(2),
    read: (g) => g.elevation.contrast.atNoon,
    write: (g, v) => {
      g.elevation.contrast.atNoon = v;
    },
  },
  {
    id: 'dev-grade-con-golden',
    label: 'Elevation contrast — golden hour',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.elevation.contrast.atGoldenHour,
    format: (v) => v.toFixed(2),
    read: (g) => g.elevation.contrast.atGoldenHour,
    write: (g, v) => {
      g.elevation.contrast.atGoldenHour = v;
    },
  },
  {
    id: 'dev-grade-warm-noon',
    label: 'Warmth — noon',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: G.elevation.warmth.atNoon,
    format: (v) => v.toFixed(2),
    read: (g) => g.elevation.warmth.atNoon,
    write: (g, v) => {
      g.elevation.warmth.atNoon = v;
    },
  },
  {
    id: 'dev-grade-warm-golden',
    label: 'Warmth — golden hour',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: G.elevation.warmth.atGoldenHour,
    format: (v) => v.toFixed(2),
    read: (g) => g.elevation.warmth.atGoldenHour,
    write: (g, v) => {
      g.elevation.warmth.atGoldenHour = v;
    },
  },
  {
    id: 'dev-grade-lut-strength',
    label: 'LUT strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.lut.strength,
    format: (v) => v.toFixed(2),
    read: (g) => g.lut.strength,
    write: (g, v) => {
      g.lut.strength = v;
    },
  },
];
