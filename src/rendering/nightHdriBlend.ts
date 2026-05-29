// src/rendering/nightHdriBlend.ts — HDRI weight from sun elevation
import { MathUtils } from 'three';
import { getNightHdriTuning } from './nightHdriRuntime';
import { sunRevealState } from './WorldReveal';
import { SUN_REVEAL } from './skyDefaults';

function fadeBandFromTuning(): { fadeStart: number; fadeEnd: number } {
  const { fadeElevationStart, fadeElevationEnd } = getNightHdriTuning();
  return {
    fadeStart: Math.min(fadeElevationStart, fadeElevationEnd),
    fadeEnd: Math.max(fadeElevationStart, fadeElevationEnd),
  };
}

/**
 * HDRI weight from sun elevation (degrees above horizon).
 * Full at/below fadeElevationStart, zero at/above fadeElevationEnd, smoothstep between.
 *
 * If fadeElevationEnd is above SUN_ELEVATION_DAY, the sun may never reach "off" during
 * the energy reveal — HDRI stays partially visible until a higher sun angle (dev tuning).
 */
export function nightHdriWeightFromElevation(elevationDeg: number): number {
  const { fadeStart, fadeEnd } = fadeBandFromTuning();

  if (fadeEnd - fadeStart < 1e-5) {
    return elevationDeg < fadeEnd ? 1 : 0;
  }

  return MathUtils.clamp(
    1 - MathUtils.smoothstep(elevationDeg, fadeStart, fadeEnd),
    0,
    1,
  );
}

/**
 * Same fade band mapped onto reveal progress 0–1 (for debug logs only).
 * Not used for gameplay weight — progress hits 1 before the sun reaches a high fadeElevationEnd.
 */
export function nightHdriWeightFromRevealProgress(revealT: number): number {
  const { fadeStart, fadeEnd } = fadeBandFromTuning();
  const night = SUN_REVEAL.elevationNight;
  const day = SUN_REVEAL.elevationDay;
  const elevSpan = day - night;

  if (elevSpan < 1e-5) {
    return revealT >= 1 ? 0 : 1;
  }

  const t0 = MathUtils.clamp((fadeStart - night) / elevSpan, 0, 1);
  const t1 = MathUtils.clamp((fadeEnd - night) / elevSpan, 0, 1);

  if (t1 <= t0 + 1e-5) {
    return revealT < t1 ? 1 : 0;
  }

  return MathUtils.clamp(1 - MathUtils.smoothstep(revealT, t0, t1), 0, 1);
}

/** Gameplay weight follows animated sun elevation only. */
export function nightHdriWeightForGameState(): number {
  return nightHdriWeightFromElevation(sunRevealState.elevationDeg);
}
