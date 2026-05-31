// src/rendering/sky/skyDefaults.ts — sun cycle + static fallbacks (re-export VISUAL.sky)

import { VISUAL } from '../../config/visualTuning';
import type { SkyParams } from './SkySystem';

/** Preetham atmosphere + post exposure for the night state (0% energy). */
export const SKY_NIGHT = VISUAL.sky.night;

/** Preetham atmosphere + post exposure for the revealed day state (sun at 5°). */
export const SKY_DAY = VISUAL.sky.day;

export type SkyRevealAtmosphere = SkyParams & { exposure: number };

/** Static mesh init + cloud/fog defaults (not lerped during reveal). */
export const SKY_DEFAULTS = {
  turbidity: VISUAL.sky.day.turbidity,
  rayleigh: VISUAL.sky.day.rayleigh,
  mieCoefficient: VISUAL.sky.day.mieCoefficient,
  mieDirectionalG: VISUAL.sky.day.mieDirectionalG,
  fogDensity: VISUAL.sky.static.fogDensity,
  cloudCoverage: VISUAL.sky.day.cloudCoverage,
  cloudDensity: VISUAL.sky.static.cloudDensity,
  cloudElevation: VISUAL.sky.static.cloudElevation,
  showSunDisc: VISUAL.sky.static.showSunDisc,
  exposure: VISUAL.render.toneMappingExposure,
} as const satisfies SkyParams & { exposure: number };

/** Sun azimuth for dev panel; elevation is driven by WorldReveal. */
export const SUN_DEFAULTS = VISUAL.sky.sun;

/** Energy-cap reveal: night → day over one duration, sun clamped at elevationDay. */
export const SUN_REVEAL: {
  elevationNight: number;
  elevationDay: number;
  revealDuration: number;
} = VISUAL.sky.reveal;

/** Horizon instanced billboard rings + SkyMesh procedural clouds. */
export const USE_HORIZON_CLOUDS = true;
