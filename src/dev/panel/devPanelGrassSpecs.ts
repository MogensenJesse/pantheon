// src/dev/panel/devPanelGrassSpecs.ts — dev panel RangeSpec tables for grass tuning
import { VISUAL } from '../../config/visualTuning';
import type { RangeSpec } from '../bindRange';

const GRASS_FL = VISUAL.grass.foliageLighting;

export type RingField = 'radius' | 'densityPerM2' | 'bladeWidth' | 'segments';

export function ringSpecs(ringIndex: number): RangeSpec[] {
  const ring = VISUAL.grass.rings[ringIndex]!;
  const prefix = `dev-grass-ring${ringIndex}`;
  return [
    {
      id: `${prefix}-radius`,
      label: 'Ring radius (m)',
      min: 1,
      max: 80,
      step: 0.5,
      defaultValue: ring.radius,
      format: (v) => v.toFixed(1),
    },
    {
      id: `${prefix}-density`,
      label: 'Density (blades/m²)',
      min: 0.1,
      max: 1000,
      step: 1,
      defaultValue: ring.densityPerM2,
      format: (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(2)),
    },
    {
      id: `${prefix}-width`,
      label: 'Blade width',
      min: 0.01,
      max: 0.5,
      step: 0.002,
      defaultValue: ring.bladeWidth,
      format: (v) => v.toFixed(3),
    },
    {
      id: `${prefix}-segments`,
      label: 'Segments',
      min: 1,
      max: 8,
      step: 1,
      defaultValue: ring.segments,
      format: (v) => String(Math.round(v)),
    },
  ];
}

export const SHARED_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-blade-height',
    label: 'Blade height',
    min: 0.4,
    max: 3,
    step: 0.05,
    defaultValue: VISUAL.grass.bladeHeight,
    format: (v) => v.toFixed(2),
  },
];

export const GRASS_TUNING_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-wind-strength',
    label: 'Wind strength',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: VISUAL.grass.windStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-wind-speed',
    label: 'Wind speed',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.windSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-sprite-yaw',
    label: 'Sprite yaw',
    min: 0,
    max: 0.25,
    step: 0.005,
    defaultValue: VISUAL.grass.spriteRotationRandomness,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-grass-bend-drop',
    label: 'Bend drop',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: VISUAL.grass.bendDropStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-bend-shape',
    label: 'Bend shape',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: VISUAL.grass.bendControlPoint,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-ambient-sway',
    label: 'Ambient sway',
    min: 0,
    max: 0.2,
    step: 0.005,
    defaultValue: VISUAL.grass.ambientSwayStrength,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-grass-detailed-wind',
    label: 'Detailed wind (m)',
    min: 10,
    max: 120,
    step: 1,
    defaultValue: VISUAL.grass.detailedWindRadius,
    format: (v) => v.toFixed(0),
  },
  {
    id: 'dev-grass-scale-min',
    label: 'Scale min',
    min: 0.2,
    max: 2,
    step: 0.01,
    defaultValue: VISUAL.grass.bladeMinScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-scale-max',
    label: 'Scale max',
    min: 0.2,
    max: 3,
    step: 0.01,
    defaultValue: VISUAL.grass.bladeMaxScale,
    format: (v) => v.toFixed(2),
  },
];

export const GRASS_LOOK_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-color-mix',
    label: 'Base→tip mix',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.colorMixFactor,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-color-var',
    label: 'Color variation',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.colorVariationStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-rust-var',
    label: 'Rust variation',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.rustVariationStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-warm-var',
    label: 'Warm variation',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.warmVariationStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-ao-scale',
    label: 'AO strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.aoScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-ao-radius',
    label: 'AO radius (m)',
    min: 1,
    max: 40,
    step: 0.5,
    defaultValue: VISUAL.grass.aoRadius,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-ao-rim',
    label: 'AO rim',
    min: 0.1,
    max: 8,
    step: 0.1,
    defaultValue: VISUAL.grass.aoRimSmoothness,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-sheen',
    label: 'Sheen',
    min: 0,
    max: 0.2,
    step: 0.005,
    defaultValue: VISUAL.grass.sheenStrength,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-grass-transmission',
    label: 'Transmission',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.grass.transmissionStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-wind-shade',
    label: 'Wind shade',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.baseWindShade,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-shade-height',
    label: 'Shade height',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.baseShadeHeight,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-bending',
    label: 'Bending',
    min: 0,
    max: 4,
    step: 0.1,
    defaultValue: VISUAL.grass.baseBending,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-glow-mul',
    label: 'Player glow',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: VISUAL.grass.playerGlowMul,
    format: (v) => v.toFixed(2),
  },
];

export const GRASS_SUN_LIGHTING_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-wrap',
    label: 'Wrap diffuse',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: GRASS_FL.wrapStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-hemisphere',
    label: 'Hemisphere ambient',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: GRASS_FL.hemisphereStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-backlight-strength',
    label: 'Back-light strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: GRASS_FL.backlightStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-backlight-punch',
    label: 'Shadow punch-through',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: GRASS_FL.backlightPunchThrough,
    format: (v) => v.toFixed(2),
  },
];

export const GRASS_BIOME_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-biome-threshold',
    label: 'Biome threshold',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.grass.biomeGrassThreshold,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-fade-width',
    label: 'Transition width',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    defaultValue: VISUAL.grass.biomeGrassFadeWidth,
    format: (v) => v.toFixed(2),
  },
];

/** Stochastic keep + remaining-blade width gain (Revo-style far carpet). */
export const GRASS_THIN_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-hysteresis',
    label: 'Keep hysteresis',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: VISUAL.grass.stochasticHysteresis,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-proj-min',
    label: 'Projected height min',
    min: 0.001,
    max: 0.02,
    step: 0.001,
    defaultValue: VISUAL.grass.projectedHeightMin,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-grass-proj-full',
    label: 'Projected height full',
    min: 0.005,
    max: 0.08,
    step: 0.001,
    defaultValue: VISUAL.grass.projectedHeightFull,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-grass-clump-strength',
    label: 'Clump strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.clumpStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-clump-scale',
    label: 'Clump size (m)',
    min: 2,
    max: 80,
    step: 0.5,
    defaultValue: VISUAL.grass.clumpScaleM,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-clump-coverage',
    label: 'Clump coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.clumpCoverage,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-clump-softness',
    label: 'Clump softness',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.grass.clumpSoftness,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-clump-edge-scale',
    label: 'Clump edge scale',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.clumpEdgeMinScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-clump-edge-density',
    label: 'Clump edge density',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.clumpEdgeDensityBoost,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-width-gain',
    label: 'Far width gain',
    min: 1,
    max: 8,
    step: 0.1,
    defaultValue: VISUAL.grass.widthFarGain,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-width-near',
    label: 'Width near (m)',
    min: 1,
    max: 80,
    step: 0.5,
    defaultValue: VISUAL.grass.widthNearRadius,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-width-far',
    label: 'Width far (m)',
    min: 5,
    max: 200,
    step: 1,
    defaultValue: VISUAL.grass.widthFarRadius,
    format: (v) => v.toFixed(0),
  },
];

/** Soft LOD ring overlap — changing this rebuilds ring tiles. */
export const GRASS_RING_FADE_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-ring-fade-band',
    label: 'Fade LOD0→1 (m)',
    min: 0,
    max: 32,
    step: 0.5,
    defaultValue: VISUAL.grass.ringFadeBandM,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-ring-fade-band-12',
    label: 'Fade LOD1→2 (m)',
    min: 0,
    max: 80,
    step: 1,
    defaultValue: VISUAL.grass.ringFadeBandLod12M,
    format: (v) => v.toFixed(0),
  },
  {
    id: 'dev-grass-ring-fade-in-2',
    label: 'Fade-in LOD2 (m)',
    min: 0,
    max: 16,
    step: 0.5,
    defaultValue: VISUAL.grass.ringFadeInLod2M,
    format: (v) => v.toFixed(1),
  },
];

export const GRASS_TRAIL_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-trail-growth',
    label: 'Regrow rate',
    min: 0,
    max: 12,
    step: 0.1,
    defaultValue: VISUAL.grass.trailGrowthRate,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-trail-min',
    label: 'Crush scale',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: VISUAL.grass.trailMinScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-trail-radius',
    label: 'Foot radius (m)',
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: VISUAL.grass.trailRadius,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-trail-kdown',
    label: 'Crush speed',
    min: 0,
    max: 80,
    step: 1,
    defaultValue: VISUAL.grass.trailKDown,
    format: (v) => v.toFixed(0),
  },
  {
    id: 'dev-grass-trail-bend',
    label: 'Trail bend',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.grass.trailBendStrength,
    format: (v) => v.toFixed(2),
  },
];

export const FLOWER_SHARED_SPECS: RangeSpec[] = [
  {
    id: 'dev-flower-density',
    label: 'Flowers per side',
    min: 8,
    max: 64,
    step: 1,
    defaultValue: VISUAL.grass.flowers.flowersPerSide,
    format: (v) => String(Math.round(v)),
  },
  {
    id: 'dev-flower-height',
    label: 'Height (m)',
    min: -0.05,
    max: 1,
    step: 0.005,
    defaultValue: VISUAL.grass.flowers.heightOffset,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-flower-scale-min',
    label: 'Scale min',
    min: 0.05,
    max: 0.5,
    step: 0.005,
    defaultValue: VISUAL.grass.flowers.minScale,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-flower-scale-max',
    label: 'Scale max',
    min: 0.05,
    max: 0.5,
    step: 0.005,
    defaultValue: VISUAL.grass.flowers.maxScale,
    format: (v) => v.toFixed(3),
  },
  {
    id: 'dev-flower-color-strength',
    label: 'Color strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.flowers.colorStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-flower-grass-threshold',
    label: 'Grass threshold',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: VISUAL.grass.flowers.grassThreshold,
    format: (v) => v.toFixed(2),
  },
];

export type FlowerSliderKey =
  | 'flowersPerSide'
  | 'heightOffset'
  | 'minScale'
  | 'maxScale'
  | 'colorStrength'
  | 'grassThreshold';

export const FLOWER_SHARED_KEY_MAP: Record<string, FlowerSliderKey> = {
  'dev-flower-density': 'flowersPerSide',
  'dev-flower-height': 'heightOffset',
  'dev-flower-scale-min': 'minScale',
  'dev-flower-scale-max': 'maxScale',
  'dev-flower-color-strength': 'colorStrength',
  'dev-flower-grass-threshold': 'grassThreshold',
};

export type SharedSliderKey =
  | 'bladeHeight'
  | 'windStrength'
  | 'windSpeed'
  | 'bladeMinScale'
  | 'bladeMaxScale'
  | 'colorMixFactor'
  | 'colorVariationStrength'
  | 'rustVariationStrength'
  | 'warmVariationStrength'
  | 'aoRadius'
  | 'aoRimSmoothness'
  | 'aoScale'
  | 'sheenStrength'
  | 'transmissionStrength'
  | 'baseWindShade'
  | 'baseShadeHeight'
  | 'baseBending'
  | 'spriteRotationRandomness'
  | 'bendDropStrength'
  | 'bendControlPoint'
  | 'ambientSwayStrength'
  | 'detailedWindRadius'
  | 'playerGlowMul'
  | 'wrapStrength'
  | 'hemisphereStrength'
  | 'backlightStrength'
  | 'backlightPunchThrough'
  | 'biomeGrassThreshold'
  | 'biomeGrassFadeWidth'
  | 'ringFadeBandM'
  | 'ringFadeBandLod12M'
  | 'ringFadeInLod2M'
  | 'widthFarGain'
  | 'widthNearRadius'
  | 'widthFarRadius'
  | 'projectedHeightMin'
  | 'projectedHeightFull'
  | 'stochasticHysteresis'
  | 'clumpStrength'
  | 'clumpScaleM'
  | 'clumpCoverage'
  | 'clumpSoftness'
  | 'clumpEdgeMinScale'
  | 'clumpEdgeDensityBoost'
  | 'trailGrowthRate'
  | 'trailMinScale'
  | 'trailRadius'
  | 'trailKDown'
  | 'trailBendStrength';

export const SHARED_KEY_MAP: Record<string, SharedSliderKey> = {
  'dev-grass-blade-height': 'bladeHeight',
  'dev-grass-wind-strength': 'windStrength',
  'dev-grass-wind-speed': 'windSpeed',
  'dev-grass-scale-min': 'bladeMinScale',
  'dev-grass-scale-max': 'bladeMaxScale',
  'dev-grass-color-mix': 'colorMixFactor',
  'dev-grass-color-var': 'colorVariationStrength',
  'dev-grass-rust-var': 'rustVariationStrength',
  'dev-grass-warm-var': 'warmVariationStrength',
  'dev-grass-ao-scale': 'aoScale',
  'dev-grass-ao-radius': 'aoRadius',
  'dev-grass-ao-rim': 'aoRimSmoothness',
  'dev-grass-sheen': 'sheenStrength',
  'dev-grass-transmission': 'transmissionStrength',
  'dev-grass-wind-shade': 'baseWindShade',
  'dev-grass-shade-height': 'baseShadeHeight',
  'dev-grass-bending': 'baseBending',
  'dev-grass-sprite-yaw': 'spriteRotationRandomness',
  'dev-grass-bend-drop': 'bendDropStrength',
  'dev-grass-bend-shape': 'bendControlPoint',
  'dev-grass-ambient-sway': 'ambientSwayStrength',
  'dev-grass-detailed-wind': 'detailedWindRadius',
  'dev-grass-glow-mul': 'playerGlowMul',
  'dev-grass-wrap': 'wrapStrength',
  'dev-grass-hemisphere': 'hemisphereStrength',
  'dev-grass-backlight-strength': 'backlightStrength',
  'dev-grass-backlight-punch': 'backlightPunchThrough',
  'dev-grass-biome-threshold': 'biomeGrassThreshold',
  'dev-grass-fade-width': 'biomeGrassFadeWidth',
  'dev-grass-ring-fade-band': 'ringFadeBandM',
  'dev-grass-ring-fade-band-12': 'ringFadeBandLod12M',
  'dev-grass-ring-fade-in-2': 'ringFadeInLod2M',
  'dev-grass-hysteresis': 'stochasticHysteresis',
  'dev-grass-clump-strength': 'clumpStrength',
  'dev-grass-clump-scale': 'clumpScaleM',
  'dev-grass-clump-coverage': 'clumpCoverage',
  'dev-grass-clump-softness': 'clumpSoftness',
  'dev-grass-clump-edge-scale': 'clumpEdgeMinScale',
  'dev-grass-clump-edge-density': 'clumpEdgeDensityBoost',
  'dev-grass-proj-min': 'projectedHeightMin',
  'dev-grass-proj-full': 'projectedHeightFull',
  'dev-grass-width-gain': 'widthFarGain',
  'dev-grass-width-near': 'widthNearRadius',
  'dev-grass-width-far': 'widthFarRadius',
  'dev-grass-trail-growth': 'trailGrowthRate',
  'dev-grass-trail-min': 'trailMinScale',
  'dev-grass-trail-radius': 'trailRadius',
  'dev-grass-trail-kdown': 'trailKDown',
  'dev-grass-trail-bend': 'trailBendStrength',
};

export const ALL_RING_SPECS = [0, 1, 2].flatMap((i) => ringSpecs(i));
export const ALL_SHARED_SPECS = [
  ...SHARED_SPECS,
  ...GRASS_TUNING_SPECS,
  ...GRASS_LOOK_SPECS,
  ...GRASS_SUN_LIGHTING_SPECS,
  ...GRASS_BIOME_SPECS,
  ...GRASS_THIN_SPECS,
  ...GRASS_RING_FADE_SPECS,
  ...GRASS_TRAIL_SPECS,
];
