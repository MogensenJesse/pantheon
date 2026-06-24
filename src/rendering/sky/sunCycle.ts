// src/rendering/sky/sunCycle.ts — midnight→midnight sun path (elevation + azimuth)
import { VISUAL } from '../../config/visualTuning';
import { sunRevealState } from '../../core/reveal/WorldReveal';
import {
  dayPhaseFromElevation,
  elevationFromDayPhase,
  getActiveCycle,
} from './lightingCurves';

export interface SunPosition {
  elevationDeg: number;
  azimuthDeg: number;
}

function normalizeCyclePhase(phase: number): number {
  const t = phase % 1;
  return t < 0 ? t + 1 : t;
}

/**
 * One full azimuth turn per cycle, always the same screen direction (east → west).
 * Sunrise sits at {@link getActiveCycle}.azimuthEast; phase 0 is north (below horizon).
 */
function azimuthFromCyclePhase(phase: number): number {
  const t = normalizeCyclePhase(phase);
  const { sunrisePhase, azimuthEast } = getActiveCycle();
  const rel = normalizeCyclePhase(t - sunrisePhase + 1);
  return (azimuthEast - 360 * rel + 720) % 360;
}

/** Full cycle phase 0..1 (midnight → midnight) → sun elevation + azimuth. */
export function sunPositionFromCyclePhase(phase: number): SunPosition {
  const t = normalizeCyclePhase(phase);
  const cycle = getActiveCycle();
  const { reveal } = VISUAL.sky;
  const nightElev = reveal.elevationNight;
  const sunrise = cycle.sunrisePhase;
  const sunset = 1 - sunrise;

  if (t < sunrise) {
    return {
      elevationDeg: nightElev,
      azimuthDeg: azimuthFromCyclePhase(t),
    };
  }

  if (t < sunset) {
    const daySpan = sunset - sunrise;
    const dayT = daySpan > 1e-5 ? (t - sunrise) / daySpan : 0;
    return {
      elevationDeg: elevationFromDayPhase(dayT),
      azimuthDeg: azimuthFromCyclePhase(t),
    };
  }

  return {
    elevationDeg: nightElev,
    azimuthDeg: azimuthFromCyclePhase(t),
  };
}

/** Inverse for dev panel sync — day arc from elevation; night from azimuth. */
export function cyclePhaseFromSunPosition(elevationDeg: number, azimuthDeg: number): number {
  const cycle = getActiveCycle();
  const sunrise = cycle.sunrisePhase;
  const sunset = 1 - sunrise;
  const daySpan = sunset - sunrise;
  const nightElev = VISUAL.sky.reveal.elevationNight;

  if (elevationDeg > nightElev + 0.5) {
    const dayT = dayPhaseFromElevation(elevationDeg);
    return normalizeCyclePhase(sunrise + dayT * daySpan);
  }

  const rel = ((cycle.azimuthEast - azimuthDeg + 360) % 360) / 360;
  return normalizeCyclePhase(sunrise + rel);
}

/** Apply cycle phase to shared sun state. */
export function applySunPositionFromCyclePhase(phase: number): SunPosition {
  const pos = sunPositionFromCyclePhase(phase);
  sunRevealState.elevationDeg = pos.elevationDeg;
  sunRevealState.azimuthDeg = pos.azimuthDeg;
  return pos;
}
