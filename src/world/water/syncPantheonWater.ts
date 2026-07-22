// src/world/water/syncPantheonWater.ts — per-frame sun + day/night drive for WaterMesh
import { Color, MathUtils, Vector3 } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { runtimeSettings } from '../../core/GameState';
import { sunDirectionFromSpherical } from '../../rendering/sunSpherical';
import type { PantheonWaterSyncTarget } from './pantheonWaterTypes';
import { syncWaterWaveUniforms } from './syncWaterWaveUniforms';
import { WATER_DAY, WATER_NIGHT } from './waterConfig';
import { syncWaterShoreUniforms } from './waterShoreSync';

const _sunDir = new Vector3();
const _waterColor = new Color();
const _sunColor = new Color();

const NIGHT = VISUAL.sky.lightingCurve.nightDaylightFloor;
/** Matches previous toFixed(2) sun-key granularity. */
const SUN_DIR_EPS_DEG = 0.005;

let lastElevationDeg = Number.NaN;
let lastAzimuthDeg = Number.NaN;
let lastDaylightBucket = -1;
let lastSize = Number.NaN;
let lastAlpha = Number.NaN;
let lastDistortion = Number.NaN;
function daylightBucket(daylight: number): number {
  return Math.round(daylight * 200);
}

/**
 * Syncs the ocean to the shared sun each frame. Direction matches the sky rig
 * and Preetham {@link SkyMesh} sun position (same as stock three.js WaterMesh).
 */
export function syncPantheonWater(
  water: PantheonWaterSyncTarget,
  elevationDeg: number,
  daylight: number,
  sunAzimuthDeg: number,
): void {
  const dayBucket = daylightBucket(daylight);
  const w = runtimeSettings.water;

  const sunMoved =
    Number.isNaN(lastElevationDeg) ||
    Math.abs(elevationDeg - lastElevationDeg) > SUN_DIR_EPS_DEG ||
    Math.abs(sunAzimuthDeg - lastAzimuthDeg) > SUN_DIR_EPS_DEG;
  if (sunMoved) {
    sunDirectionFromSpherical(elevationDeg, sunAzimuthDeg, _sunDir);
    water.sunDirection.value.copy(_sunDir).normalize();
    lastElevationDeg = elevationDeg;
    lastAzimuthDeg = sunAzimuthDeg;
  }

  if (dayBucket !== lastDaylightBucket) {
    const t = MathUtils.smoothstep(daylight, NIGHT, 1);
    _waterColor.copy(WATER_NIGHT.waterColor).lerp(WATER_DAY.waterColor, t);
    _sunColor.copy(WATER_NIGHT.sunColor).lerp(WATER_DAY.sunColor, t);
    water.waterColor.value.copy(_waterColor);
    water.sunColor.value.copy(_sunColor);
    lastDaylightBucket = dayBucket;
  }

  const t = MathUtils.smoothstep(daylight, NIGHT, 1);
  const distortion = MathUtils.lerp(w.distortionNight, w.distortionDay, t);
  if (distortion !== lastDistortion) {
    water.distortionScale.value = distortion;
    lastDistortion = distortion;
  }
  if (w.size !== lastSize) {
    water.size.value = w.size;
    lastSize = w.size;
  }
  if (w.alpha !== lastAlpha) {
    water.alpha.value = w.alpha;
    lastAlpha = w.alpha;
  }

  if (water.shoreUniforms) {
    syncWaterShoreUniforms(water.shoreUniforms, daylight);
  }
  syncWaterWaveUniforms();
}
