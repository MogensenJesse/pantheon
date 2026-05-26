// src/world/grass/grassDevDefaults.ts — grass scatter constants and dev defaults
import { PHASE0 } from '../../config/phase0';
import type { GrassDevSettings } from '../../core/GameState';

/** Height/spacing/scale bands for cover vs accent clumps (scene design, not dev-tuned). */
export const GRASS_COVER_BAND = {
  heightMin: 0.25,
  heightMax: 1.75,
  minSpacing: 0.7,
  scaleMin: 3.5,
  scaleMax: 8,
} as const;

export const GRASS_ACCENT_BAND = {
  heightMin: 0.35,
  heightMax: 1.1,
  minSpacing: 2,
  scaleMin: 3,
  scaleMax: 5,
} as const;

export const GRASS_DEV_DEFAULTS: Pick<GrassDevSettings, 'windStrength' | 'windSpeed' | 'densityMul' | 'scaleMul'> = {
  windStrength: PHASE0.GRASS.WIND_STRENGTH,
  windSpeed: PHASE0.GRASS.WIND_SPEED,
  densityMul: 2,
  scaleMul: 1.5,
};

export function resetGrassDev(grass: GrassDevSettings): void {
  grass.windStrength = GRASS_DEV_DEFAULTS.windStrength;
  grass.windSpeed = GRASS_DEV_DEFAULTS.windSpeed;
  grass.densityMul = GRASS_DEV_DEFAULTS.densityMul;
  grass.scaleMul = GRASS_DEV_DEFAULTS.scaleMul;
}
