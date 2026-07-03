// src/ui/dev/devPanelBloomSpecs.ts — RangeSpec tables for the Glow & bloom dev panel
import { VISUAL } from '../../config/visualTuning';
import type { BloomParams } from '../../rendering/PostFX';
import type { RangeSpec } from './bindRange';

const B = VISUAL.bloom;

export interface BloomSpec extends RangeSpec {
  key: keyof BloomParams;
}

export const CORE_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-strength',
    label: 'Strength',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: B.STRENGTH,
    format: (v) => v.toFixed(2),
    key: 'emissiveStrength',
  },
  {
    id: 'dev-bloom-radius',
    label: 'Radius',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: B.RADIUS,
    format: (v) => v.toFixed(2),
    key: 'radius',
  },
  {
    id: 'dev-bloom-scene-mul',
    label: 'Scene mix',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: B.SCENE_STRENGTH_MUL,
    format: (v) => v.toFixed(2),
    key: 'sceneStrengthMul',
  },
];

export const THRESHOLD_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-threshold',
    label: 'Luma threshold',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: B.SCENE_THRESHOLD,
    format: (v) => v.toFixed(2),
    key: 'sceneThreshold',
  },
  {
    id: 'dev-bloom-smooth-width',
    label: 'Threshold smooth',
    min: 0.001,
    max: 0.2,
    step: 0.005,
    defaultValue: B.SMOOTH_WIDTH,
    format: (v) => v.toFixed(3),
    key: 'smoothWidth',
  },
];

export const SKY_MASK_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-sky-depth-start',
    label: 'Sky depth start',
    min: 0.9,
    max: 1,
    step: 0.001,
    defaultValue: B.SKY_DEPTH_START,
    format: (v) => v.toFixed(4),
    key: 'skyDepthStart',
  },
  {
    id: 'dev-bloom-sky-depth-end',
    label: 'Sky depth end',
    min: 0.9,
    max: 1,
    step: 0.001,
    defaultValue: B.SKY_DEPTH_END,
    format: (v) => v.toFixed(4),
    key: 'skyDepthEnd',
  },
  {
    id: 'dev-bloom-sky-luma-start',
    label: 'Keep sun luma start',
    min: 0.4,
    max: 1.4,
    step: 0.01,
    defaultValue: B.SKY_SUN_LUMA_START,
    format: (v) => v.toFixed(2),
    key: 'skySunLumaStart',
  },
  {
    id: 'dev-bloom-sky-luma-end',
    label: 'Keep sun luma end',
    min: 0.4,
    max: 1.6,
    step: 0.01,
    defaultValue: B.SKY_SUN_LUMA_END,
    format: (v) => v.toFixed(2),
    key: 'skySunLumaEnd',
  },
];

export const GLOW_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-hdr-scale',
    label: 'Glow HDR scale',
    min: 0.5,
    max: 12,
    step: 0.05,
    defaultValue: B.HDR_SCALE,
    format: (v) => v.toFixed(2),
    key: 'hdrScale',
  },
];

export const ALL_BLOOM_SPECS: BloomSpec[] = [
  ...CORE_SPECS,
  ...THRESHOLD_SPECS,
  ...SKY_MASK_SPECS,
  ...GLOW_SPECS,
];
