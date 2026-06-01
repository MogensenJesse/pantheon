// src/world/grass/grassDevDefaults.ts — grass scatter constants and dev defaults

import { VISUAL } from '../../config/visualTuning';
import type { GrassDevSettings } from '../../core/GameState';

/** Height/spacing/scale bands for cover vs accent clumps (scene design, not dev-tuned). */

import type { FoliageBiomeRules } from './foliageTypes';

export const GRASS_COVER_BAND = {
  minSpacing: 0.7,
  scaleMin: 3.5,
  scaleMax: 8,
} as const;

export const GRASS_ACCENT_BAND = {
  minSpacing: 2,
  scaleMin: 3,
  scaleMax: 5,
} as const;

export function cloneFoliageBiomeRules(): FoliageBiomeRules {
  return structuredClone(VISUAL.grass.biomes);
}

export function resetGrassDev(grass: GrassDevSettings): void {
  grass.windStrength = VISUAL.grass.windStrength;
  grass.windSpeed = VISUAL.grass.windSpeed;
  grass.densityMul = VISUAL.grass.densityMul;
  grass.scaleMul = VISUAL.grass.scaleMul;
  grass.biomes = cloneFoliageBiomeRules();
}
