// src/config/visual/foliage.ts — wrap/hemi lighting for props + grass

const FOLIAGE_SKY_TINT = '#c8d8f0';
const FOLIAGE_GROUND_TINT = '#3d4a32';

/** Hemisphere sky / ground tint per TOD stop (props + grass + flowers) — todWeights. */
const FOLIAGE_TINT_STOPS = {
  night: { sky: FOLIAGE_SKY_TINT, ground: FOLIAGE_GROUND_TINT },
  goldenHour: { sky: FOLIAGE_SKY_TINT, ground: FOLIAGE_GROUND_TINT },
  noon: { sky: FOLIAGE_SKY_TINT, ground: FOLIAGE_GROUND_TINT },
} as const;

const FOLIAGE_LIGHTING = {
  wrapStrength: 1,
  hemisphereStrength: 0.6,
  foliageMul: 1,
  barkMul: 0.35,
  defaultMul: 0.65,
  vertexColorMul: 1,
} as const;

const GRASS_FOLIAGE_LIGHTING = {
  wrapStrength: 0.55,
  hemisphereStrength: 0.38,
  backlightStrength: 0.65,
  backlightPunchThrough: 0.2,
  backlightTint: '#f0d99c',
} as const;

/** Shared foliage look (props + grass) exposed on VISUAL. */
export const foliage = {
  tintStops: FOLIAGE_TINT_STOPS,
} as const;

export { FOLIAGE_LIGHTING, FOLIAGE_TINT_STOPS, GRASS_FOLIAGE_LIGHTING };
