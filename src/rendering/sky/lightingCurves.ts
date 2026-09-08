// src/rendering/sky/lightingCurves.ts — elevation-driven lighting sample via shared TOD band
import type { AmbientLight, DirectionalLight } from 'three';
import { MathUtils } from 'three';
import type { TodStopId } from '../../config/visual/tod';
import { TOD_STOPS } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';
import { state } from '../../core/GameState';
import { sampleTodStop, todGoldenAmount, todWeights } from '../tod/todBlend';
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
  /** 0..1 day factor — cloud opacity reveal ramp. */
  atmosphereBlendT: number;
}

export type LightingStopValues = {
  daylightFactor: number;
  sunIntensity: number;
  ambientIntensity: number;
  globalExposure: number;
  skyExposure: number;
};

function emptyLightingSample(): LightingSample {
  return {
    daylightFactor: 0,
    sunIntensity: 0,
    ambientIntensity: 0,
    skyExposure: 0,
    globalExposure: 0,
    atmosphereBlendT: 0,
  };
}

function copyLightingSample(src: LightingSample, dst: LightingSample): LightingSample {
  dst.daylightFactor = src.daylightFactor;
  dst.sunIntensity = src.sunIntensity;
  dst.ambientIntensity = src.ambientIntensity;
  dst.skyExposure = src.skyExposure;
  dst.globalExposure = src.globalExposure;
  dst.atmosphereBlendT = src.atmosphereBlendT;
  return dst;
}

const _scratchSample = emptyLightingSample();
const _revealSample = emptyLightingSample();
const _lerpOut = emptyLightingSample();
const _lightingStopOut: LightingStopValues = {
  daylightFactor: 0,
  sunIntensity: 0,
  ambientIntensity: 0,
  globalExposure: 0,
  skyExposure: 0,
};

let _revealSunriseLightingSample: LightingSample | null = null;

/** DEV + reveal sunrise: override elevation-driven sample for one frame. */
export function setRevealSunriseLightingSample(sample: LightingSample | null): void {
  if (sample === null) {
    _revealSunriseLightingSample = null;
    return;
  }
  _revealSunriseLightingSample = copyLightingSample(sample, _revealSample);
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
  out: LightingSample = _lerpOut,
): LightingSample {
  const tt = MathUtils.clamp(t, 0, 1);
  out.daylightFactor = MathUtils.lerp(a.daylightFactor, b.daylightFactor, tt);
  out.sunIntensity = MathUtils.lerp(a.sunIntensity, b.sunIntensity, tt);
  out.ambientIntensity = MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, tt);
  out.skyExposure = MathUtils.lerp(a.skyExposure, b.skyExposure, tt);
  out.globalExposure = MathUtils.lerp(a.globalExposure, b.globalExposure, tt);
  out.atmosphereBlendT = MathUtils.lerp(a.atmosphereBlendT, b.atmosphereBlendT, tt);
  return out;
}

type LightingStopOverride = Partial<LightingStopValues>;
const _lightingStopOverrides: Record<TodStopId, LightingStopOverride> = {
  night: {},
  goldenHour: {},
  noon: {},
};

/** DEV: override one lighting stop field. */
export function setLightingStopDevOverride(
  stop: TodStopId,
  partial: LightingStopOverride,
): void {
  _lightingStopOverrides[stop] = { ..._lightingStopOverrides[stop], ...partial };
}

export function resetLightingCurveDevOverride(): void {
  for (const stop of TOD_STOPS) {
    _lightingStopOverrides[stop] = {};
  }
}

function activeLightingStops(): Record<TodStopId, LightingStopValues> {
  const base = VISUAL.sky.lighting;
  return {
    night: { ...base.night, ..._lightingStopOverrides.night },
    goldenHour: { ...base.goldenHour, ..._lightingStopOverrides.goldenHour },
    noon: { ...base.noon, ..._lightingStopOverrides.noon },
  };
}

export function getActiveLightingStop(stop: TodStopId): LightingStopValues {
  return activeLightingStops()[stop];
}

type CycleParams = {
  peakElevationDeg: number;
  dayDurationSec: number;
  sunsetElevationDeg: number;
  sunriseElevationDeg: number;
  loop: boolean;
  sunrisePhase: number;
  revealSunrise: { durationSec: number; targetElevationDeg: number };
  azimuthEast: number;
};
type CycleOverride = Partial<{
  peakElevationDeg: number;
  dayDurationSec: number;
  sunsetElevationDeg: number;
  sunriseElevationDeg: number;
}>;

let _cycleOverride: CycleOverride = {};
let _cachedCycle: CycleParams | null = null;

/** DEV: override day-cycle arc params for live tuning. */
export function setCycleDevOverride(partial: CycleOverride): void {
  _cycleOverride = { ..._cycleOverride, ...partial };
  _cachedCycle = null;
}

export function resetCycleDevOverride(): void {
  _cycleOverride = {};
  _cachedCycle = null;
}

function activeCycle(): CycleParams {
  if (_cachedCycle) return _cachedCycle;
  _cachedCycle = { ...VISUAL.sky.cycle, ..._cycleOverride };
  return _cachedCycle;
}

/** Active cycle params (VISUAL + DEV overrides). */
export function getActiveCycle(): CycleParams {
  return activeCycle();
}

/** Map sun elevation (°) to normalized day factor 0..1 (peaks at cycle.peakElevationDeg). */
export function elevationToDayT(elevationDeg: number): number {
  const cycle = activeCycle();
  const belowHorizon = cycle.sunriseElevationDeg;
  const { peakElevationDeg } = cycle;
  const span = peakElevationDeg - belowHorizon;
  if (span < 1e-5) return elevationDeg >= belowHorizon ? 1 : 0;
  return MathUtils.clamp(MathUtils.smoothstep(elevationDeg, belowHorizon, peakElevationDeg), 0, 1);
}

/**
 * 0..1 golden amount from shared TOD band (`todWeights.goldenHour`).
 * Prefer `todWeights` / `todGoldenAmount` for new code.
 */
export function goldenHourT(elevationDeg: number, _power?: number): number {
  return todGoldenAmount(elevationDeg);
}

/** 0..1 orb collection progress for cumulative world night lift. */
export function orbWorldLightnessT(): number {
  const { maxOrbs } = VISUAL.sky.worldLightness;
  return MathUtils.clamp(state.orbsAbsorbed / Math.max(1, maxOrbs), 0, 1);
}

/**
 * All lighting signals derived from sun elevation via TOD stops.
 * Writes into `out` (defaults to a shared scratch — copy if you need to keep two samples).
 */
export function sampleLighting(
  elevationDeg: number,
  out: LightingSample = _scratchSample,
): LightingSample {
  const { worldLightness } = VISUAL.sky;
  const sampled = sampleTodStop(activeLightingStops(), elevationDeg, _lightingStopOut);
  const w = todWeights(elevationDeg);
  const orbLift = orbWorldLightnessT() * w.night;

  out.daylightFactor = sampled.daylightFactor + orbLift * worldLightness.daylightLift;
  out.sunIntensity = sampled.sunIntensity;
  out.ambientIntensity = sampled.ambientIntensity + orbLift * worldLightness.ambientLift;
  out.globalExposure = sampled.globalExposure + orbLift * worldLightness.groundExposureLift;
  out.skyExposure = sampled.skyExposure + orbLift * worldLightness.skyExposureLift;
  out.atmosphereBlendT = elevationToDayT(elevationDeg);
  return out;
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
