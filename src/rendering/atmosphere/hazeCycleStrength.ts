// src/rendering/atmosphere/hazeCycleStrength.ts — fog/haze master vs sun elevation (day-night cycle)
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';

/**
 * 0..1 fog master from sun elevation: ~0 in full day, ramps through golden hour/dusk,
 * 1 at night; mirrors on sunrise (same elevation curve).
 */
export function hazeStrengthForElevation(elevationDeg: number): number {
  const { clearElevationDeg, fullElevationDeg, cyclePower } = VISUAL.atmosphere.haze;
  const span = clearElevationDeg - fullElevationDeg;
  if (span < 1e-5) return elevationDeg <= fullElevationDeg ? 1 : 0;

  const dayT = MathUtils.clamp((elevationDeg - fullElevationDeg) / span, 0, 1);
  const nightT = 1 - dayT;
  return nightT ** cyclePower;
}

/** World-Y fog band top: low on clear day, rises with nightT through dusk / night. */
export function fogTopForElevation(elevationDeg: number, nightTop?: number): number {
  const { fogTopDay, fogTop } = VISUAL.atmosphere.haze;
  const nightT = hazeStrengthForElevation(elevationDeg);
  return MathUtils.lerp(fogTopDay, nightTop ?? fogTop, nightT);
}
