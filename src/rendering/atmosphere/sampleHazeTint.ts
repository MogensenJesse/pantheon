// src/rendering/atmosphere/sampleHazeTint.ts — CPU day/night haze color from the lighting clock
import { Color } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { elevationToDayT } from '../sky/lightingCurves';

const _day = new Color();
const _night = new Color();

export interface HazeTintParams {
  nightColor: string;
  dayColor: string;
}

/**
 * Lerp haze fog color from sun `dayT` plus a single HDRI pull toward night.
 * Orb-lifted `daylightFactor` is not a driver — it already lives on lighting/water.
 */
export function sampleHazeTint(
  elevationDeg: number,
  hdriWeight: number,
  tint: HazeTintParams,
  out = new Color(),
): Color {
  const dayT = elevationToDayT(elevationDeg);

  _night.set(tint.nightColor);
  _day.set(tint.dayColor);
  out.copy(_night).lerp(_day, dayT);

  const pull = VISUAL.atmosphere.haze.hdriTintPull;
  if (hdriWeight > 0.01 && pull > 0) {
    out.lerp(_night, hdriWeight * (1 - dayT) * pull);
  }

  return out;
}
