// src/rendering/atmosphere/atmosphereCycle.ts — night-valley master + fog tint vs sun elevation
import { Color, MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { sampleTodColor } from '../tod/todBlend';

export interface HazeCycleParams {
  /** Sun elevation (°) at/above which night valley master ≈ 0 (clear midday). */
  clearElevationDeg: number;
  /** Sun elevation (°) at/below which fog/haze master = 1 (night / deep dusk). */
  fullElevationDeg: number;
  /** >1 keeps afternoons clearer longer before mist builds (1 = linear ramp). */
  cyclePower: number;
}

export interface HazeTintParams {
  night: string;
  goldenHour: string;
  noon: string;
}

function defaultHazeCycleParams(): HazeCycleParams {
  const H = VISUAL.atmosphere.haze;
  return {
    clearElevationDeg: H.clearElevationDeg,
    fullElevationDeg: H.fullElevationDeg,
    cyclePower: H.cyclePower,
  };
}

let cycleParams: HazeCycleParams = defaultHazeCycleParams();

export function getHazeCycleParams(): HazeCycleParams {
  return { ...cycleParams };
}

export function setHazeCycleParams(partial: Partial<HazeCycleParams>): void {
  cycleParams = { ...cycleParams, ...partial };
}

export function resetHazeCycleParams(): void {
  cycleParams = defaultHazeCycleParams();
}

/**
 * 0..1 night-valley fog master from sun elevation: ~0 in full day, ramps through
 * golden hour/dusk, 1 at night; mirrors on sunrise.
 * Live aerial is `aerialStrength × mix(aerialNightMul, 1, 1 − this)`. Envelope is
 * `fullElevationDeg` → `clearElevationDeg` (default −5°→30°) at `cyclePower`
 * — sibling to the tod golden band (look tint uses todWeights). See `visual/atmosphere.ts`.
 */
export function hazeStrengthForElevation(elevationDeg: number): number {
  const { clearElevationDeg, fullElevationDeg, cyclePower } = cycleParams;
  const span = clearElevationDeg - fullElevationDeg;
  if (span < 1e-5) return elevationDeg <= fullElevationDeg ? 1 : 0;

  const dayT = MathUtils.clamp((elevationDeg - fullElevationDeg) / span, 0, 1);
  const nightT = 1 - dayT;
  return nightT ** cyclePower;
}

/**
 * Fog tint from shared todWeights (night / golden / noon stops).
 * Orb-lifted `daylightFactor` is not a driver — it already lives on lighting/water.
 */
export function sampleHazeTint(
  elevationDeg: number,
  tint: HazeTintParams,
  out = new Color(),
): Color {
  return sampleTodColor(tint, elevationDeg, out);
}
