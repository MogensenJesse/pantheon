// src/dev/panel/devPanelGodraysSpecs.ts — RangeSpec tables for the Light shafts / god rays dev panel
import { GODRAYS_MAX_SAMPLES } from '../../config/visual/godrays';
import { VISUAL } from '../../config/visualTuning';
import type { GodraysParams } from '../../rendering/PostFX';
import type { RangeSpec } from '../bindRange';

const G = VISUAL.godrays;

export interface GodraysSpec extends RangeSpec {
  key: Exclude<keyof GodraysParams, 'weight'>;
}

export const STRENGTH_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-weight-mul',
    label: 'Weight mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: G.WEIGHT_MUL,
    format: (v) => v.toFixed(2),
    key: 'weightMul',
  },
  {
    id: 'dev-godrays-exposure',
    label: 'Exposure',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: G.EXPOSURE,
    format: (v) => v.toFixed(2),
    key: 'exposure',
  },
];

export const DENSITY_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-density',
    label: 'Density (step)',
    min: 0.1,
    max: 3,
    step: 0.05,
    defaultValue: G.DENSITY,
    format: (v) => v.toFixed(2),
    key: 'density',
  },
  {
    id: 'dev-godrays-decay',
    label: 'Decay',
    min: 0.8,
    max: 0.995,
    step: 0.005,
    defaultValue: G.DECAY,
    format: (v) => v.toFixed(3),
    key: 'decay',
  },
  {
    id: 'dev-godrays-samples',
    label: 'Samples',
    min: 16,
    max: GODRAYS_MAX_SAMPLES,
    step: 8,
    defaultValue: G.SAMPLES,
    format: (v) => String(Math.round(v)),
    key: 'samples',
  },
];

export const TINT_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-tint-r',
    label: 'Tint R',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.TINT_R,
    format: (v) => v.toFixed(2),
    key: 'tintR',
  },
  {
    id: 'dev-godrays-tint-g',
    label: 'Tint G',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.TINT_G,
    format: (v) => v.toFixed(2),
    key: 'tintG',
  },
  {
    id: 'dev-godrays-tint-b',
    label: 'Tint B',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.TINT_B,
    format: (v) => v.toFixed(2),
    key: 'tintB',
  },
];

export const MASK_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-depth-start',
    label: 'Sky dist start (× far)',
    min: 0.5,
    max: 0.98,
    step: 0.01,
    defaultValue: G.DEPTH_START,
    format: (v) => v.toFixed(2),
    key: 'depthStart',
  },
  {
    id: 'dev-godrays-depth-end',
    label: 'Sky dist end (× far)',
    min: 0.8,
    max: 1,
    step: 0.005,
    defaultValue: G.DEPTH_END,
    format: (v) => v.toFixed(3),
    key: 'depthEnd',
  },
  {
    id: 'dev-godrays-sun-core',
    label: 'Sun disc core',
    min: 0.001,
    max: 0.08,
    step: 0.001,
    defaultValue: G.SUN_CORE,
    format: (v) => v.toFixed(3),
    key: 'sunCore',
  },
  {
    id: 'dev-godrays-sun-radius',
    label: 'Sun disc radius',
    min: 0.004,
    max: 0.3,
    step: 0.002,
    defaultValue: G.SUN_RADIUS,
    format: (v) => v.toFixed(3),
    key: 'sunRadius',
  },
  {
    id: 'dev-godrays-offscreen-fade',
    label: 'Off-screen fade',
    min: 0.05,
    max: 1,
    step: 0.05,
    defaultValue: G.OFFSCREEN_FADE,
    format: (v) => v.toFixed(2),
    key: 'offscreenFade',
  },
];

export const ALL_SPECS = [...STRENGTH_SPECS, ...DENSITY_SPECS, ...TINT_SPECS, ...MASK_SPECS];
