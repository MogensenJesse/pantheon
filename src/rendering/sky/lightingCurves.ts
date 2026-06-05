// src/rendering/sky/lightingCurves.ts — elevation-driven lighting sample (single master signal)
import type { AmbientLight, DirectionalLight } from 'three';
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import type { SkySystemContext } from './SkySystem';

export interface LightingSample {
  /** 0 night .. 1 full day — drives fog, clouds, water, grass. */
  daylightFactor: number;
  sunIntensity: number;
  ambientIntensity: number;
  /** SkyMesh colorNode multiplier (decoupled from global AgX). */
  skyExposure: number;
  /** AgX post exposure. */
  globalExposure: number;
  /** 0..1 night→day Preetham atmosphere blend. */
  atmosphereBlendT: number;
}

type ExposureCurveOverride = Partial<{
  groundLow: number;
  groundHigh: number;
  skyLow: number;
  skyHigh: number;
}>;

let _exposureCurveOverride: ExposureCurveOverride = {};

/** DEV: override exposure curve endpoints for live tuning. */
export function setLightingCurveDevOverride(partial: ExposureCurveOverride): void {
  _exposureCurveOverride = { ..._exposureCurveOverride, ...partial };
}

export function resetLightingCurveDevOverride(): void {
  _exposureCurveOverride = {};
}

function activeExposureCurve() {
  return { ...VISUAL.sky.exposureCurve, ..._exposureCurveOverride };
}

type CycleOverride = Partial<{
  peakElevationDeg: number;
  dayDurationSec: number;
  sunsetElevationDeg: number;
}>;

let _cycleOverride: CycleOverride = {};

/** DEV: override day-cycle arc params for live tuning. */
export function setCycleDevOverride(partial: CycleOverride): void {
  _cycleOverride = { ..._cycleOverride, ...partial };
}

export function resetCycleDevOverride(): void {
  _cycleOverride = {};
}

function activeCycle() {
  return { ...VISUAL.sky.cycle, ..._cycleOverride };
}

/** Active cycle params (VISUAL + DEV overrides). */
export function getActiveCycle() {
  return activeCycle();
}

/** Map sun elevation (°) to normalized day factor 0..1 (peaks at cycle.peakElevationDeg). */
export function elevationToDayT(elevationDeg: number): number {
  const { reveal } = VISUAL.sky;
  const { peakElevationDeg } = activeCycle();
  const span = peakElevationDeg - reveal.elevationNight;
  if (span < 1e-5) return elevationDeg >= reveal.elevationNight ? 1 : 0;
  return MathUtils.clamp(
    MathUtils.smoothstep(elevationDeg, reveal.elevationNight, peakElevationDeg),
    0,
    1,
  );
}

/** All lighting signals derived from sun elevation. */
export function sampleLighting(elevationDeg: number): LightingSample {
  const { revealLighting } = VISUAL.sky;
  const exposureCurve = activeExposureCurve();
  const dayT = elevationToDayT(elevationDeg);

  const daylightFactor =
    revealLighting.nightSky + dayT * (1 - revealLighting.nightSky);
  const sunIntensity = dayT * revealLighting.sunIntensityMax;
  const ambientIntensity =
    revealLighting.ambientMin + dayT * (revealLighting.ambientMax - revealLighting.ambientMin);
  const globalExposure = MathUtils.lerp(exposureCurve.groundLow, exposureCurve.groundHigh, dayT);
  const skyExposure = MathUtils.lerp(exposureCurve.skyLow, exposureCurve.skyHigh, dayT);

  return {
    daylightFactor,
    sunIntensity,
    ambientIntensity,
    skyExposure,
    globalExposure,
    atmosphereBlendT: dayT,
  };
}

/** Push sun / ambient / sky daylight from elevation sample. */
export function applyWorldLightingFromElevation(
  elevationDeg: number,
  sun: DirectionalLight,
  ambientLight: AmbientLight,
  sky: SkySystemContext,
): LightingSample {
  const sample = sampleLighting(elevationDeg);
  sun.intensity = sample.sunIntensity;
  ambientLight.intensity = sample.ambientIntensity;
  sky.setDaylight(sample.daylightFactor);
  return sample;
}

/** Day-cycle phase 0..1 → elevation (dawn → peak → sunset). */
export function elevationFromDayPhase(phase: number): number {
  const { reveal } = VISUAL.sky;
  const { peakElevationDeg, sunsetElevationDeg } = activeCycle();
  const t = MathUtils.clamp(phase, 0, 1);
  const dawn = reveal.elevationDay;
  const peak = peakElevationDeg;
  const sunset = sunsetElevationDeg;

  if (t <= 0.5) {
    return MathUtils.lerp(dawn, peak, t * 2);
  }
  return MathUtils.lerp(peak, sunset, (t - 0.5) * 2);
}

/** Sky bloom mask reduce factor — low at horizon sun, high at noon (less sky bloom). */
export function skyReduceForElevation(elevationDeg: number): number {
  const { bloom } = VISUAL;
  const dayT = elevationToDayT(elevationDeg);
  return MathUtils.lerp(bloom.SKY_REDUCE_LOW, bloom.SKY_REDUCE_HIGH, dayT);
}

/**
 * Player orb illumination ratio (0..1 → point-light distance/intensity gain).
 * Below energy cap: grows with collected energy (one-time reveal expansion).
 * At cap: fades with sun elevation — small ring at night, nearly off at high sun.
 */
export function playerIlluminationRatio(energyRatio: number, elevationDeg: number): number {
  const energy = MathUtils.clamp(energyRatio, 0, 1);
  if (energy < 1 - 1e-5) return energy;

  const { player } = VISUAL;
  const dayT = elevationToDayT(elevationDeg);
  return MathUtils.lerp(player.illuminationNight, player.illuminationDay, dayT);
}

/** Inverse of elevationFromDayPhase for dev panel sync. */
export function dayPhaseFromElevation(elevationDeg: number): number {
  const { reveal } = VISUAL.sky;
  const { peakElevationDeg, sunsetElevationDeg } = activeCycle();
  const dawn = reveal.elevationDay;
  const peak = peakElevationDeg;
  const sunset = sunsetElevationDeg;

  if (elevationDeg <= dawn) return 0;
  if (elevationDeg >= peak) {
    const fallSpan = peak - sunset;
    if (fallSpan < 1e-5) return 1;
    return 0.5 + (0.5 * (peak - elevationDeg)) / fallSpan;
  }
  const riseSpan = peak - dawn;
  if (riseSpan < 1e-5) return 0;
  return (0.5 * (elevationDeg - dawn)) / riseSpan;
}
