// src/rendering/sky/skyDefaults.ts — sun cycle + static fallbacks (re-export VISUAL.sky)

import { VISUAL } from '../../config/visualTuning';
import type { SkyParams } from './SkySystem';

/** Preetham scatter scalars (numeric) shared by night / golden / noon stops. */
export type SkyAtmosphereScalars = {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
};

/** Full Preetham look stop — scatter + RGB multiply tint. */
export type SkyAtmosphereStop = SkyAtmosphereScalars & {
  /** RGB multiply after exposure, before horizon haze. */
  tint: string;
};

/** Preetham atmosphere for the night state (below golden start). */
export const SKY_NIGHT: SkyAtmosphereStop = VISUAL.sky.night;

/** Preetham atmosphere for golden hour (inside TOD band). */
export const SKY_GOLDEN: SkyAtmosphereStop = VISUAL.sky.goldenHour;

/** Preetham atmosphere for noon (above golden end). */
export const SKY_NOON: SkyAtmosphereStop = VISUAL.sky.noon;

/** @deprecated Use SKY_NOON — kept for any stale imports during migration. */
export const SKY_DAY = SKY_NOON;

/** Reveal-blend + dev override shape (atmosphere scalars only; AgX exposure is separate). */
export type SkyRevealAtmosphere = SkyParams;

/** Static mesh init defaults (not lerped during reveal). */
export const SKY_DEFAULTS = {
  turbidity: VISUAL.sky.noon.turbidity,
  rayleigh: VISUAL.sky.noon.rayleigh,
  mieCoefficient: VISUAL.sky.noon.mieCoefficient,
  mieDirectionalG: VISUAL.sky.noon.mieDirectionalG,
  showSunDisc: VISUAL.sky.static.showSunDisc,
} as const satisfies SkyParams;

/** Below-horizon elevation before energy cap / during night bands. */
export const NIGHT_BASELINE_ELEVATION_DEG = VISUAL.sky.nightBaseline.elevationNight;
