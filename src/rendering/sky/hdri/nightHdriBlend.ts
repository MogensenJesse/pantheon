// src/rendering/sky/hdri/nightHdriBlend.ts — HDRI weight from sun elevation
import { MathUtils } from 'three';
import { sunRevealState } from '../../../core/reveal/sunRevealState';
import { getNightHdriTuning } from './nightHdriRuntime';

/**
 * HDRI weight from sun elevation (degrees above horizon).
 * Full at/below fadeElevationStart, zero at/above fadeElevationEnd, smoothstep between.
 *
 * If fadeElevationEnd is above the day-cycle peak, the sun may never fully fade HDRI during play.
 */
export function nightHdriWeightFromElevation(elevationDeg: number): number {
  const { fadeElevationStart, fadeElevationEnd } = getNightHdriTuning();
  const fadeStart = Math.min(fadeElevationStart, fadeElevationEnd);
  const fadeEnd = Math.max(fadeElevationStart, fadeElevationEnd);

  if (fadeEnd - fadeStart < 1e-5) {
    return elevationDeg < fadeEnd ? 1 : 0;
  }

  return MathUtils.clamp(1 - MathUtils.smoothstep(elevationDeg, fadeStart, fadeEnd), 0, 1);
}

/** Gameplay weight follows animated sun elevation only. */
export function nightHdriWeightForGameState(): number {
  return nightHdriWeightFromElevation(sunRevealState.elevationDeg);
}
