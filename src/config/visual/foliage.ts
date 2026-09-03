// src/config/visual/foliage.ts — wrap/hemi lighting for props + grass

const FOLIAGE_SKY_TINT = '#c8d8f0';
const FOLIAGE_GROUND_TINT = '#3d4a32';

const FOLIAGE_LIGHTING = {
  wrapStrength: 1,
  hemisphereStrength: 0.6,
  foliageMul: 1,
  barkMul: 0.35,
  defaultMul: 0.65,
  vertexColorMul: 1,
  skyTint: FOLIAGE_SKY_TINT,
  groundTint: FOLIAGE_GROUND_TINT,
} as const;

const GRASS_FOLIAGE_LIGHTING = {
  wrapStrength: 0.55,
  hemisphereStrength: 0.38,
  skyTint: FOLIAGE_SKY_TINT,
  groundTint: FOLIAGE_GROUND_TINT,
  backlightStrength: 0.65,
  backlightPunchThrough: 0.2,
  backlightTint: '#f0d99c',
} as const;

export { FOLIAGE_LIGHTING, GRASS_FOLIAGE_LIGHTING };
