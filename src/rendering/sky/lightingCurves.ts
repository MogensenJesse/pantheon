// src/rendering/sky/lightingCurves.ts — elevation-driven lighting sample (single master signal)
import type { AmbientLight, DirectionalLight } from 'three';
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { state } from '../../core/GameState';
import type { SkySystemContext } from './SkySystem';

export interface LightingSample {
  /** 0 night .. 1 full day — drives clouds, water, grass. */
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

let _revealSunriseLightingSample: LightingSample | null = null;

/** DEV + reveal sunrise: override elevation-driven sample for one frame. */
export function setRevealSunriseLightingSample(sample: LightingSample | null): void {
  _revealSunriseLightingSample = sample;
}

function activeLightingSample(elevationDeg: number): LightingSample {
  return _revealSunriseLightingSample ?? sampleLighting(elevationDeg);
}

/** Lighting sample for sky/post sync — respects reveal-sunrise override when active. */
export function getActiveLightingSample(elevationDeg: number): LightingSample {
  return activeLightingSample(elevationDeg);
}

/** Lerp two lighting samples (reveal sunrise dawn → target). */
export function lerpLightingSample(
  a: LightingSample,
  b: LightingSample,
  t: number,
): LightingSample {
  const tt = MathUtils.clamp(t, 0, 1);
  return {
    daylightFactor: MathUtils.lerp(a.daylightFactor, b.daylightFactor, tt),
    sunIntensity: MathUtils.lerp(a.sunIntensity, b.sunIntensity, tt),
    ambientIntensity: MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, tt),
    skyExposure: MathUtils.lerp(a.skyExposure, b.skyExposure, tt),
    globalExposure: MathUtils.lerp(a.globalExposure, b.globalExposure, tt),
    atmosphereBlendT: MathUtils.lerp(a.atmosphereBlendT, b.atmosphereBlendT, tt),
  };
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
  sunriseElevationDeg: number;
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
  const belowHorizon = activeCycle().sunriseElevationDeg;
  const { peakElevationDeg } = activeCycle();
  const span = peakElevationDeg - belowHorizon;
  if (span < 1e-5) return elevationDeg >= belowHorizon ? 1 : 0;
  return MathUtils.clamp(MathUtils.smoothstep(elevationDeg, belowHorizon, peakElevationDeg), 0, 1);
}

/** 0..1 orb collection progress for cumulative world night lift. */
export function orbWorldLightnessT(): number {
  const { maxOrbs } = VISUAL.sky.worldLightness;
  return MathUtils.clamp(state.orbsAbsorbed / Math.max(1, maxOrbs), 0, 1);
}

/** All lighting signals derived from sun elevation. */
export function sampleLighting(elevationDeg: number): LightingSample {
  const { lightingCurve, worldLightness } = VISUAL.sky;
  const exposureCurve = activeExposureCurve();
  const dayT = elevationToDayT(elevationDeg);
  const nightWeight = 1 - dayT;
  const orbLift = orbWorldLightnessT() * nightWeight;

  const daylightFactor =
    lightingCurve.nightDaylightFloor +
    orbLift * worldLightness.daylightLift +
    dayT * (1 - lightingCurve.nightDaylightFloor);
  const sunIntensity = dayT * lightingCurve.sunIntensityMax;
  const ambientIntensity =
    lightingCurve.ambientMin +
    orbLift * worldLightness.ambientLift +
    dayT * (lightingCurve.ambientMax - lightingCurve.ambientMin);
  const globalExposure =
    exposureCurve.groundLow +
    orbLift * worldLightness.groundExposureLift +
    dayT * (exposureCurve.groundHigh - exposureCurve.groundLow);
  const skyExposure =
    exposureCurve.skyLow +
    orbLift * worldLightness.skyExposureLift +
    dayT * (exposureCurve.skyHigh - exposureCurve.skyLow);

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
  const sample = activeLightingSample(elevationDeg);
  sun.intensity = sample.sunIntensity;
  ambientLight.intensity = sample.ambientIntensity;
  sky.setDaylight(sample.daylightFactor);
  return sample;
}

/** Day-cycle phase 0..1 → elevation (dawn → peak → sunset). */
export function elevationFromDayPhase(phase: number): number {
  const { peakElevationDeg, sunsetElevationDeg, sunriseElevationDeg } = activeCycle();
  const t = MathUtils.clamp(phase, 0, 1);
  const dawn = sunriseElevationDeg;
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
  const { peakElevationDeg, sunsetElevationDeg, sunriseElevationDeg } = activeCycle();
  const dawn = sunriseElevationDeg;
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
