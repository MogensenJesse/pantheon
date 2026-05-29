// src/rendering/skyDefaults.ts — sun cycle + static fallbacks

import type { SkyParams } from './SkySystem';

/** Preetham atmosphere + post exposure for the night state (0% energy). */
export const SKY_NIGHT = {
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  cloudCoverage: 0,
  exposure: 0.6,
} as const;

/** Preetham atmosphere + post exposure for the revealed day state (sun at 5°). */
export const SKY_DAY = {
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  cloudCoverage: 0,
  exposure: 0.1,
} as const;

export type SkyRevealAtmosphere = SkyParams & { exposure: number };

/** Static mesh init + cloud/fog defaults (not lerped during reveal). */
export const SKY_DEFAULTS = {
  turbidity: SKY_DAY.turbidity,
  rayleigh: SKY_DAY.rayleigh,
  mieCoefficient: SKY_DAY.mieCoefficient,
  mieDirectionalG: SKY_DAY.mieDirectionalG,
  fogDensity: 0.0004,
  cloudCoverage: SKY_DAY.cloudCoverage,
  cloudDensity: 0.4,
  cloudElevation: 0.5,
  showSunDisc: 1,
  exposure: SKY_DAY.exposure,
} as const satisfies SkyParams & { exposure: number };

/** Sun azimuth for dev panel; elevation is driven by WorldReveal. */
export const SUN_DEFAULTS = {
  azimuthDeg: 180,
  lightDistance: 50,
};

/** Energy-cap reveal: night → day over one duration, sun clamped at elevationDay. */
export const SUN_REVEAL = {
  elevationNight: -5,
  elevationDay: 5,
  revealDuration: 10,
};

/** Horizon billboard rings off by default; SkyMesh shader clouds only. */
export const USE_HORIZON_CLOUDS = true;
