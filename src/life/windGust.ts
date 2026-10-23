// src/life/windGust.ts — how hard the wind blows beyond its calm base: storms, and the gust before rain (pure: node-runnable)
//
// The wind blows toward `headingToXZ(θ)` for a heading θ in degrees: the convention the clouds and the storm fronts
// already use (270° is toward -x), so grass, trees, smoke and drifting leaves all go the way the clouds go. The
// boost multiplies the calm wind: 1 in calm weather.

import { life } from '../config/visual/life.ts';
import { clamp01 } from '../core/math/scalar.ts';

const W = life.WIND;

/** The gust before rain, 0..1: how much more rain is coming than there is now (rain `LEAD_S` ahead minus rain now). */
export function preRainGust(rainNow: number, rainAhead: number): number {
  return clamp01(rainAhead - rainNow);
}

/** The wind boost the weather asks for: 1 in calm weather, more in rain and just before it. */
export function windBoostTarget(rain01: number, preRain01: number): number {
  return 1 + W.STORM_GAIN * clamp01(rain01) + W.PRE_RAIN_GAIN * clamp01(preRain01);
}
