// src/rendering/sky/skyDefaults.ts — sun cycle + static fallbacks (re-export VISUAL.sky)

import { VISUAL } from '../../config/visualTuning';
import type { SkyParams } from './SkySystem';

/** Preetham atmosphere for the night state (0% energy). */
export const SKY_NIGHT = VISUAL.sky.night;

/** Preetham atmosphere for full daylight (day cycle peak). */
export const SKY_DAY = VISUAL.sky.day;

/** Reveal-blend + dev override shape (atmosphere scalars only; AgX exposure is separate). */
export type SkyRevealAtmosphere = SkyParams;

/** Static mesh init defaults (not lerped during reveal). */
export const SKY_DEFAULTS = {
  turbidity: VISUAL.sky.day.turbidity,
  rayleigh: VISUAL.sky.day.rayleigh,
  mieCoefficient: VISUAL.sky.day.mieCoefficient,
  mieDirectionalG: VISUAL.sky.day.mieDirectionalG,
  cloudCoverage: VISUAL.sky.static.cloudCoverage,
  cloudDensity: VISUAL.sky.static.cloudDensity,
  cloudElevation: VISUAL.sky.static.cloudElevation,
  cloudSpeed: VISUAL.sky.static.cloudSpeed,
  showSunDisc: VISUAL.sky.static.showSunDisc,
} as const satisfies SkyParams;

/** Below-horizon elevation before energy cap / during night bands. */
export const NIGHT_BASELINE_ELEVATION_DEG = VISUAL.sky.nightBaseline.elevationNight;
