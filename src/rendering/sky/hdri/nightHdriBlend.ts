// src/rendering/sky/hdri/nightHdriBlend.ts — HDRI weight from sun elevation
import { MathUtils } from 'three';
import { sunRevealState } from '../../../core/reveal/WorldReveal';
import { getNightHdriTuning } from './nightHdriRuntime';

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
 * If fadeElevationEnd is above the day-cycle peak, the sun may never fully fade HDRI during play.
 */
export function nightHdriWeightFromElevation(elevationDeg: number): number {
  const { fadeStart, fadeEnd } = fadeBandFromTuning();

  if (fadeEnd - fadeStart < 1e-5) {
    return elevationDeg < fadeEnd ? 1 : 0;
  }

  return MathUtils.clamp(1 - MathUtils.smoothstep(elevationDeg, fadeStart, fadeEnd), 0, 1);
}

/** Gameplay weight follows animated sun elevation only. */
export function nightHdriWeightForGameState(): number {
  return nightHdriWeightFromElevation(sunRevealState.elevationDeg);
}
