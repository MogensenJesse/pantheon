// src/config/visual/foliage.ts — wrap/hemi lighting for props + grass

/** Hemisphere sky / ground tint per TOD stop (props + grass + flowers) — todWeights. */
const FOLIAGE_TINT_STOPS = {
  night: { sky: '#5A70A8', ground: '#1A2030' },
  goldenHour: { sky: '#8A98C8', ground: '#5A3A2A' },
  noon: { sky: '#B8D0F0', ground: '#4A5A38' },
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
