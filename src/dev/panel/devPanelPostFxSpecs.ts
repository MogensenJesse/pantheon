// src/dev/panel/devPanelPostFxSpecs.ts — RangeSpec tables for the Post FX dev panel
import { VISUAL } from '../../config/visualTuning';
import type { PostFxGradeDevSettings } from '../../core/GameState';
import type { RangeSpec } from '../bindRange';

const G = VISUAL.postfx.grade;

export interface GradeSpec extends RangeSpec {
  read: (g: PostFxGradeDevSettings) => number;
  write: (g: PostFxGradeDevSettings, v: number) => void;
}

export const GRADE_SPECS: GradeSpec[] = [
  {
    id: 'dev-grade-lift',
    label: 'Lift R',
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
    label: 'Saturation — noon',
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
    label: 'Saturation — golden hour',
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
    label: 'Contrast — noon',
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
    label: 'Contrast — golden hour',
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
