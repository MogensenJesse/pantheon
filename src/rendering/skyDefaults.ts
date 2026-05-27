// src/rendering/skyDefaults.ts — sun cycle + static fallbacks

import type { SkyParams } from './SkySystem';

/** Static mesh defaults (low-sun preset; runtime blend overrides each frame). */
export const SKY_DEFAULTS = {
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  fogDensity: 0.0004,
  cloudCoverage: 0,
  cloudDensity: 0.4,
  cloudElevation: 0.5,
  showSunDisc: 1,
  exposure: 0.6,
} as const satisfies SkyParams & { exposure: number };

/** Sun placement — azimuth fixed; elevation driven by WorldReveal after energy cap. */
export const SUN_DEFAULTS = {
  elevationDeg: 1,
  azimuthDeg: 180,
  lightDistance: 50,
};

/** Energy-cap sunrise, then slow arc to midday. */
export const SUN_REVEAL = {
  elevationNight: -5,
  /** First light when energy reaches 100%. */
  elevationSunrise: 1,
  /** End of automatic day arc. */
  elevationNoon: 90,
  /** Night → first light (seconds). */
  sunriseDuration: 3,
  /** First light → noon elevation (seconds). */
  dayArcDuration: 600,
};

/** Horizon billboard rings off by default; SkyMesh shader clouds only. */
export const USE_HORIZON_CLOUDS = false;
