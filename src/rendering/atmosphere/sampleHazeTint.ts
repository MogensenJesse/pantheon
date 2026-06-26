// src/rendering/atmosphere/sampleHazeTint.ts — CPU day/night haze color (parallel to water lerp)
import { Color, MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { elevationToDayT } from '../sky/lightingCurves';

const _day = new Color();
const _night = new Color();

export interface HazeTintParams {
  nightColor: string;
  dayColor: string;
}

/** Lerp haze fog color from sun elevation, daylight, and night HDRI weight. */
export function sampleHazeTint(
  elevationDeg: number,
  daylight: number,
  hdriWeight: number,
  tint: HazeTintParams,
  out = new Color(),
): Color {
  const dayT = elevationToDayT(elevationDeg);
  const floor = VISUAL.sky.lightingCurve.nightDaylightFloor;
  const daylightT = MathUtils.smoothstep(daylight, floor, 1);
  const t = Math.max(dayT, daylightT);

  _night.set(tint.nightColor);
  _day.set(tint.dayColor);
  out.copy(_night).lerp(_day, t);

  if (hdriWeight > 0.01) {
    out.lerp(_night, hdriWeight * (1 - dayT) * 0.45);
  }

  return out;
}
