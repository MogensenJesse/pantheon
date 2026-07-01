// src/ui/dev/devPanelGodraysSpecs.ts — RangeSpec tables for the Light shafts / god rays dev panel
import { VISUAL } from '../../config/visualTuning';
import type { GodraysHorizonDevSettings } from '../../core/GameState';
import type { GodraysParams } from '../../rendering/PostFX';
import type { RangeSpec } from './bindRange';

const G = VISUAL.godrays;
const HORIZON = G.horizonOcclusion;

export interface GodraysSpec extends RangeSpec {
  key: keyof GodraysParams;
}

export const STRENGTH_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-intensity-mul',
    label: 'Intensity mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: G.INTENSITY_MUL,
    format: (v) => v.toFixed(2),
    key: 'intensityMul',
  },
  {
    id: 'dev-godrays-weight-min',
    label: 'Blend min (floor)',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.WEIGHT_MIN,
    format: (v) => v.toFixed(2),
    key: 'weightMin',
  },
  {
    id: 'dev-godrays-weight-max',
    label: 'Blend max',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.WEIGHT_MAX,
    format: (v) => v.toFixed(2),
    key: 'weightMax',
  },
];

export const DENSITY_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-density',
    label: 'Density base',
    min: 0,
    max: 4,
    step: 0.05,
    defaultValue: G.DENSITY_BASE,
    format: (v) => v.toFixed(2),
    key: 'densityBase',
  },
  {
    id: 'dev-godrays-max-density',
    label: 'Max density',
    min: 0,
    max: 4,
    step: 0.05,
    defaultValue: G.MAX_DENSITY_BASE,
    format: (v) => v.toFixed(2),
    key: 'maxDensityBase',
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

export const EDGE_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-edge-radius',
    label: 'Edge radius',
    min: 0,
    max: 8,
    step: 1,
    defaultValue: G.EDGE_RADIUS,
    format: (v) => String(Math.round(v)),
    key: 'edgeRadius',
  },
  {
    id: 'dev-godrays-edge-strength',
    label: 'Edge strength',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: G.EDGE_STRENGTH,
    format: (v) => v.toFixed(1),
    key: 'edgeStrength',
  },
];

export const MASK_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-sky-luma-start',
    label: 'Sky luma start',
    min: 0.4,
    max: 1.2,
    step: 0.01,
    defaultValue: G.SKY_LUMA_START,
    format: (v) => v.toFixed(2),
    key: 'skyLumaStart',
  },
  {
    id: 'dev-godrays-sky-luma-end',
    label: 'Sky luma end',
    min: 0.4,
    max: 1.4,
    step: 0.01,
    defaultValue: G.SKY_LUMA_END,
    format: (v) => v.toFixed(2),
    key: 'skyLumaEnd',
  },
  {
    id: 'dev-godrays-sun-facing-min',
    label: 'Sun facing min',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    defaultValue: G.SUN_FACING_MIN,
    format: (v) => v.toFixed(2),
    key: 'sunFacingMin',
  },
  {
    id: 'dev-godrays-sun-facing-max',
    label: 'Sun facing max',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.SUN_FACING_MAX,
    format: (v) => v.toFixed(2),
    key: 'sunFacingMax',
  },
];

export const SUN_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-sun-int-ref',
    label: 'Sun intensity ref',
    min: 0.2,
    max: 4,
    step: 0.05,
    defaultValue: G.SUN_INTENSITY_REF,
    format: (v) => v.toFixed(2),
    key: 'sunIntensityRef',
  },
  {
    id: 'dev-godrays-elev-falloff',
    label: 'Elevation falloff',
    min: 10,
    max: 120,
    step: 1,
    defaultValue: G.ELEV_RAY_FALLOFF,
    format: (v) => String(Math.round(v)),
    key: 'elevRayFalloff',
  },
  {
    id: 'dev-godrays-elev-min',
    label: 'Elev factor min',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.ELEV_FACTOR_MIN,
    format: (v) => v.toFixed(2),
    key: 'elevFactorMin',
  },
  {
    id: 'dev-godrays-elev-max',
    label: 'Elev factor max',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: G.ELEV_FACTOR_MAX,
    format: (v) => v.toFixed(2),
    key: 'elevFactorMax',
  },
];

export const ALL_SPECS = [
  ...STRENGTH_SPECS,
  ...DENSITY_SPECS,
  ...TINT_SPECS,
  ...EDGE_SPECS,
  ...MASK_SPECS,
  ...SUN_SPECS,
];

export interface HorizonSpec extends RangeSpec {
  key: Exclude<keyof GodraysHorizonDevSettings, 'enabled'>;
}

export const HORIZON_SPECS: HorizonSpec[] = [
  {
    id: 'dev-godrays-horizon-max-distance',
    label: 'Max distance (m)',
    min: 100,
    max: 3000,
    step: 25,
    defaultValue: HORIZON.maxDistanceM,
    format: (v) => String(Math.round(v)),
    key: 'maxDistanceM',
  },
  {
    id: 'dev-godrays-horizon-sample-count',
    label: 'Samples per ray',
    min: 4,
    max: 48,
    step: 1,
    defaultValue: HORIZON.sampleCount,
    format: (v) => String(Math.round(v)),
    key: 'sampleCount',
  },
  {
    id: 'dev-godrays-horizon-fan-count',
    label: 'Ray fan count',
    min: 1,
    max: 7,
    step: 1,
    defaultValue: HORIZON.rayFanCount,
    format: (v) => String(Math.round(v)),
    key: 'rayFanCount',
  },
  {
    id: 'dev-godrays-horizon-fan-spread',
    label: 'Ray fan spread (°)',
    min: 0,
    max: 45,
    step: 1,
    defaultValue: HORIZON.rayFanSpreadDeg,
    format: (v) => String(Math.round(v)),
    key: 'rayFanSpreadDeg',
  },
  {
    id: 'dev-godrays-horizon-smooth-rate',
    label: 'Smooth rate (/s)',
    min: 0.2,
    max: 10,
    step: 0.1,
    defaultValue: HORIZON.smoothRatePerSec,
    format: (v) => v.toFixed(1),
    key: 'smoothRatePerSec',
  },
];
