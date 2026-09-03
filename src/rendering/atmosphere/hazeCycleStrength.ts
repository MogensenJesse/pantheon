// src/rendering/atmosphere/hazeCycleStrength.ts — fog/haze master vs sun elevation (day-night cycle)
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';

export interface HazeCycleParams {
  /** Sun elevation (°) at/above which night valley master ≈ 0 (clear midday). */
  clearElevationDeg: number;
  /** Sun elevation (°) at/below which fog/haze master = 1 (night / deep dusk). */
  fullElevationDeg: number;
  /** >1 keeps afternoons clearer longer before mist builds (1 = linear ramp). */
  cyclePower: number;
  /** World Y — band top recedes to this on clear day. */
  fogTopDay: number;
}

function defaultHazeCycleParams(): HazeCycleParams {
  const H = VISUAL.atmosphere.haze;
  return {
    clearElevationDeg: H.clearElevationDeg,
    fullElevationDeg: H.fullElevationDeg,
    cyclePower: H.cyclePower,
    fogTopDay: H.fogTopDay,
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
 * golden hour/dusk, 1 at night; mirrors on sunrise. Day XZ aerial is a separate uniform.
 * Envelope is `fullElevationDeg` → `clearElevationDeg` (default −5°→30°) at `cyclePower`
 * — sibling to `goldenHourT` (same power, peak at 58°). See the table in `visual/atmosphere.ts`.
 */
export function hazeStrengthForElevation(elevationDeg: number): number {
  const { clearElevationDeg, fullElevationDeg, cyclePower } = cycleParams;
  const span = clearElevationDeg - fullElevationDeg;
  if (span < 1e-5) return elevationDeg <= fullElevationDeg ? 1 : 0;

  const dayT = MathUtils.clamp((elevationDeg - fullElevationDeg) / span, 0, 1);
  const nightT = 1 - dayT;
  return nightT ** cyclePower;
}

/** World-Y fog band top: low on clear day, rises with nightT through dusk / night. */
export function fogTopForElevation(elevationDeg: number, nightTop?: number): number {
  const { fogTopDay } = cycleParams;
  const { fogTop } = VISUAL.atmosphere.haze;
  const nightT = hazeStrengthForElevation(elevationDeg);
  return MathUtils.lerp(fogTopDay, nightTop ?? fogTop, nightT);
}
