// src/world/water/sync/syncPantheonWater.ts — per-frame sun + day/night drive for WaterMesh

import type { DirectionalLight } from 'three';
import { Color, MathUtils, Vector3 } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { runtimeSettings } from '../../../core/GameState';
import { copyBakedSunDirection } from '../../../rendering/sunShadow/bakedSunDirection';
import type { PantheonWaterSyncTarget } from '../mesh/pantheonWaterTypes';
import { syncWaterWaveUniforms } from './syncWaterWaveUniforms';
import { WATER_DAY, WATER_NIGHT } from '../config/waterConfig';
import { syncWaterShoreUniforms } from './waterShoreSync';

const _sunDir = new Vector3();
const _waterColor = new Color();
const _sunColor = new Color();

const NIGHT = VISUAL.sky.lightingCurve.nightDaylightFloor;

const _lastSunDir = new Vector3();
let lastDaylightBucket = -1;
let lastSize = Number.NaN;
let lastAlpha = Number.NaN;
let lastDistortion = Number.NaN;
function daylightBucket(daylight: number): number {
  return Math.round(daylight * 200);
}

/**
 * Syncs the ocean to the shared sun each frame. Sun direction matches the baked
 * shadow light (not continuous reveal angles — keeps water spec/shadow aligned).
 */
export function syncPantheonWater(
  water: PantheonWaterSyncTarget,
  sun: DirectionalLight,
  daylight: number,
): void {
  const dayBucket = daylightBucket(daylight);
  const w = runtimeSettings.water;

  copyBakedSunDirection(sun, _sunDir);
  const sunMoved = _lastSunDir.distanceToSquared(_sunDir) > 1e-8;
  if (sunMoved) {
    water.sunDirection.value.copy(_sunDir);
    _lastSunDir.copy(_sunDir);
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
