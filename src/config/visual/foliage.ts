// src/config/visual/foliage.ts — wrap/hemi lighting for props + grass

const FOLIAGE_LIGHTING = {
  /** Half-Lambert mix on sun-facing vs tilted cards (0 = flat, 1 = full wrap). */
  wrapStrength: 1,
  /** Sky/ground ambient tint by world normal Y (0 = off). */
  hemisphereStrength: 0.6,
  /** Multiplier on tree leaves + soft foliage materials. */
  foliageMul: 1,
  /** Tree bark / trunk — subtle shape only. */
  barkMul: 0.35,
  /** Rocks, pebbles, paths — minimal extra shading. */
  defaultMul: 0.65,
  /** Blend glTF vertex color (bark AO); leaves are white in Nature Pack. */
  vertexColorMul: 1,
  skyTint: '#c8d8f0',
  groundTint: '#3d4a32',
} as const;

const GRASS_FOLIAGE_LIGHTING = {
  wrapStrength: 0.55,
  hemisphereStrength: 0.38,
  skyTint: '#c8d8f0',
  groundTint: '#3d4a32',
  backlightStrength: 0.65,
  backlightPunchThrough: 0.2,
  backlightTint: '#f0d99c',
} as const;

export { FOLIAGE_LIGHTING, GRASS_FOLIAGE_LIGHTING };
