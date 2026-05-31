// src/world/grass/grassDevDefaults.ts — grass scatter constants and dev defaults

import type { GrassDevSettings } from '../../core/GameState';

import { VISUAL } from '../../config/visualTuning';



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

  ...VISUAL.grass,

};



export function resetGrassDev(grass: GrassDevSettings): void {

  grass.windStrength = VISUAL.grass.windStrength;

  grass.windSpeed = VISUAL.grass.windSpeed;

  grass.densityMul = VISUAL.grass.densityMul;

  grass.scaleMul = VISUAL.grass.scaleMul;

}

