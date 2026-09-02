// src/dev/panel/devPanelGrassSpecs.ts — dev panel RangeSpec tables for grass tuning
import { VISUAL } from '../../config/visualTuning';
import type { RangeSpec } from '../bindRange';

export type RingField = 'radius' | 'densityPerM2' | 'bladeWidth' | 'segments';

export type FlowerSliderKey =
  | 'flowersPerSide'
  | 'heightOffset'
  | 'minScale'
  | 'maxScale'
  | 'colorStrength'
  | 'grassThreshold';

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

const FOLIAGE_KEYS = new Set([
  'wrapStrength',
  'hemisphereStrength',
  'backlightStrength',
  'backlightPunchThrough',
] as const);

function defaultShared(key: SharedSliderKey): number {
  if ((FOLIAGE_KEYS as Set<string>).has(key)) {
    return VISUAL.grass.foliageLighting[key as keyof typeof VISUAL.grass.foliageLighting] as number;
  }
  return VISUAL.grass[key as keyof typeof VISUAL.grass] as number;
}

function sharedSpec(
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  key: SharedSliderKey,
  format: (v: number) => string,
): RangeSpec & { key: SharedSliderKey } {
  return { id, label, min, max, step, key, defaultValue: defaultShared(key), format };
}

function flowerSpec(
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  key: FlowerSliderKey,
  format: (v: number) => string,
): RangeSpec & { key: FlowerSliderKey } {
  return {
    id,
    label,
    min,
    max,
    step,
    key,
    defaultValue: VISUAL.grass.flowers[key] as number,
    format,
  };
}

const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const f0 = (v: number) => v.toFixed(0);

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
      format: f1,
    },
    {
      id: `${prefix}-density`,
      label: 'Density (blades/m²)',
      min: 0.1,
      max: 1000,
      step: 1,
      defaultValue: ring.densityPerM2,
      format: (v) => (v >= 10 ? f0(v) : f2(v)),
    },
    {
      id: `${prefix}-width`,
      label: 'Blade width',
      min: 0.01,
      max: 0.5,
      step: 0.002,
      defaultValue: ring.bladeWidth,
      format: f3,
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

export const SHARED_SPECS = [
  sharedSpec('dev-grass-blade-height', 'Blade height', 0.4, 3, 0.05, 'bladeHeight', f2),
];

export const GRASS_TUNING_SPECS = [
  sharedSpec('dev-grass-wind-strength', 'Wind strength', 0, 1.5, 0.01, 'windStrength', f2),
  sharedSpec('dev-grass-wind-speed', 'Wind speed', 0, 1, 0.01, 'windSpeed', f2),
  sharedSpec('dev-grass-sprite-yaw', 'Sprite yaw', 0, 0.25, 0.005, 'spriteRotationRandomness', f3),
  sharedSpec('dev-grass-bend-drop', 'Bend drop', 0, 3, 0.05, 'bendDropStrength', f2),
  sharedSpec('dev-grass-bend-shape', 'Bend shape', 0, 1, 0.02, 'bendControlPoint', f2),
  sharedSpec('dev-grass-ambient-sway', 'Ambient sway', 0, 0.2, 0.005, 'ambientSwayStrength', f3),
  sharedSpec('dev-grass-scale-min', 'Scale min', 0.2, 2, 0.01, 'bladeMinScale', f2),
  sharedSpec('dev-grass-scale-max', 'Scale max', 0.2, 3, 0.01, 'bladeMaxScale', f2),
];

export const GRASS_LOOK_SPECS = [
  sharedSpec('dev-grass-color-mix', 'Base→tip mix', 0, 1, 0.01, 'colorMixFactor', f2),
  sharedSpec('dev-grass-color-var', 'Color variation', 0, 1, 0.01, 'colorVariationStrength', f2),
  sharedSpec('dev-grass-rust-var', 'Rust variation', 0, 1, 0.01, 'rustVariationStrength', f2),
  sharedSpec('dev-grass-warm-var', 'Warm variation', 0, 1, 0.01, 'warmVariationStrength', f2),
  sharedSpec('dev-grass-ao-scale', 'AO strength', 0, 1, 0.01, 'aoScale', f2),
  sharedSpec('dev-grass-ao-radius', 'AO radius (m)', 1, 40, 0.5, 'aoRadius', f1),
  sharedSpec('dev-grass-ao-rim', 'AO rim', 0.1, 8, 0.1, 'aoRimSmoothness', f1),
  sharedSpec('dev-grass-sheen', 'Sheen', 0, 0.2, 0.005, 'sheenStrength', f3),
  sharedSpec('dev-grass-transmission', 'Transmission', 0, 0.5, 0.01, 'transmissionStrength', f2),
  sharedSpec('dev-grass-wind-shade', 'Wind shade', 0, 1, 0.05, 'baseWindShade', f2),
  sharedSpec('dev-grass-shade-height', 'Shade height', 0, 1, 0.05, 'baseShadeHeight', f2),
  sharedSpec('dev-grass-bending', 'Bending', 0, 4, 0.1, 'baseBending', f1),
  sharedSpec('dev-grass-glow-mul', 'Player glow', 0, 1.5, 0.05, 'playerGlowMul', f2),
];

export const GRASS_SUN_LIGHTING_SPECS = [
  sharedSpec('dev-grass-wrap', 'Wrap diffuse', 0, 1, 0.01, 'wrapStrength', f2),
  sharedSpec('dev-grass-hemisphere', 'Hemisphere ambient', 0, 1, 0.01, 'hemisphereStrength', f2),
  sharedSpec(
    'dev-grass-backlight-strength',
    'Back-light strength',
    0,
    1,
    0.01,
    'backlightStrength',
    f2,
  ),
  sharedSpec(
    'dev-grass-backlight-punch',
    'Shadow punch-through',
    0,
    1,
    0.01,
    'backlightPunchThrough',
    f2,
  ),
];

export const GRASS_BIOME_SPECS = [
  sharedSpec(
    'dev-grass-biome-threshold',
    'Biome threshold',
    0,
    0.5,
    0.01,
    'biomeGrassThreshold',
    f2,
  ),
  sharedSpec(
    'dev-grass-fade-width',
    'Transition width',
    0.05,
    0.8,
    0.01,
    'biomeGrassFadeWidth',
    f2,
  ),
];

/** Stochastic keep + remaining-blade width gain (Revo-style far carpet). */
export const GRASS_THIN_SPECS = [
  sharedSpec('dev-grass-hysteresis', 'Keep hysteresis', 0, 0.4, 0.01, 'stochasticHysteresis', f2),
  sharedSpec(
    'dev-grass-proj-min',
    'Projected height min',
    0.001,
    0.02,
    0.001,
    'projectedHeightMin',
    f3,
  ),
  sharedSpec(
    'dev-grass-proj-full',
    'Projected height full',
    0.005,
    0.08,
    0.001,
    'projectedHeightFull',
    f3,
  ),
  sharedSpec('dev-grass-clump-strength', 'Clump strength', 0, 1, 0.01, 'clumpStrength', f2),
  sharedSpec('dev-grass-clump-scale', 'Clump size (m)', 2, 80, 0.5, 'clumpScaleM', f1),
  sharedSpec('dev-grass-clump-coverage', 'Clump coverage', 0, 1, 0.01, 'clumpCoverage', f2),
  sharedSpec('dev-grass-clump-softness', 'Clump softness', 0, 0.5, 0.01, 'clumpSoftness', f2),
  sharedSpec('dev-grass-clump-edge-scale', 'Clump edge scale', 0, 1, 0.01, 'clumpEdgeMinScale', f2),
  sharedSpec(
    'dev-grass-clump-edge-density',
    'Clump edge density',
    0,
    1,
    0.01,
    'clumpEdgeDensityBoost',
    f2,
  ),
  sharedSpec('dev-grass-width-gain', 'Far width gain', 1, 8, 0.1, 'widthFarGain', f1),
  sharedSpec('dev-grass-width-near', 'Width near (m)', 1, 80, 0.5, 'widthNearRadius', f1),
  sharedSpec('dev-grass-width-far', 'Width far (m)', 5, 200, 1, 'widthFarRadius', f0),
];

/** Soft LOD ring overlap — changing this rebuilds ring tiles. */
export const GRASS_RING_FADE_SPECS = [
  sharedSpec('dev-grass-ring-fade-band', 'Fade LOD0→1 (m)', 0, 32, 0.5, 'ringFadeBandM', f1),
  sharedSpec('dev-grass-ring-fade-band-12', 'Fade LOD1→2 (m)', 0, 80, 1, 'ringFadeBandLod12M', f0),
  sharedSpec('dev-grass-ring-fade-in-2', 'Fade-in LOD2 (m)', 0, 16, 0.5, 'ringFadeInLod2M', f1),
];

export const GRASS_TRAIL_SPECS = [
  sharedSpec('dev-grass-trail-growth', 'Regrow rate', 0, 12, 0.1, 'trailGrowthRate', f1),
  sharedSpec('dev-grass-trail-min', 'Crush scale', 0, 1, 0.05, 'trailMinScale', f2),
  sharedSpec('dev-grass-trail-radius', 'Foot radius (m)', 0.2, 3, 0.1, 'trailRadius', f1),
  sharedSpec('dev-grass-trail-kdown', 'Crush speed', 0, 80, 1, 'trailKDown', f0),
  sharedSpec('dev-grass-trail-bend', 'Trail bend', 0, 2, 0.05, 'trailBendStrength', f2),
];

export const FLOWER_SHARED_SPECS = [
  flowerSpec('dev-flower-density', 'Flowers per side', 8, 64, 1, 'flowersPerSide', (v) =>
    String(Math.round(v)),
  ),
  flowerSpec('dev-flower-height', 'Height (m)', -0.05, 1, 0.005, 'heightOffset', f3),
  flowerSpec('dev-flower-scale-min', 'Scale min', 0.05, 0.5, 0.005, 'minScale', f3),
  flowerSpec('dev-flower-scale-max', 'Scale max', 0.05, 0.5, 0.005, 'maxScale', f3),
  flowerSpec('dev-flower-color-strength', 'Color strength', 0, 1, 0.01, 'colorStrength', f2),
  flowerSpec('dev-flower-grass-threshold', 'Grass threshold', 0, 0.5, 0.01, 'grassThreshold', f2),
];

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

export const SHARED_KEY_MAP: Record<string, SharedSliderKey> = Object.fromEntries(
  ALL_SHARED_SPECS.map((s) => [s.id, s.key]),
);

export const FLOWER_SHARED_KEY_MAP: Record<string, FlowerSliderKey> = Object.fromEntries(
  FLOWER_SHARED_SPECS.map((s) => [s.id, s.key]),
);
