// src/world/water/sync/syncPantheonWater.ts — per-frame sun + tod drive for WaterMesh

import type { DirectionalLight } from 'three';
import { Color, Vector3 } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { runtimeSettings } from '../../../core/GameState';
import { copyBakedSunDirection } from '../../../rendering/sunShadow/bakedSunDirection';
import { currentSunElevationDeg } from '../../../rendering/sunSpherical';
import { sampleTodColor, sampleTodScalar } from '../../../rendering/tod/todBlend';
import type { PantheonWaterSyncTarget } from '../mesh/pantheonWaterTypes';
import { syncWaterWaveUniforms } from './syncWaterWaveUniforms';
import { syncWaterShoreUniforms } from './waterShoreSync';

const _sunDir = new Vector3();
const _waterColor = new Color();
const _sunColor = new Color();

function liveWaterStops() {
  return runtimeSettings.water.stops ?? VISUAL.water.stops;
}

/**
 * How far the vertex shader can move the surface from base water Y, in either direction.
 */
function surfaceHeadroomM(): number {
  const t = runtimeSettings.water.tide;
  if (!t.enabled) return 0;
  return t.waveAmplitude;
}

const _lastSunDir = new Vector3();
let lastElevBucket = -1;
let lastSize = Number.NaN;
let lastAlpha = Number.NaN;
let lastDistortion = Number.NaN;
let lastPlaneOffset = Number.NaN;

function elevBucket(elevationDeg: number): number {
  return Math.round(elevationDeg * 20);
}

/**
 * Syncs the ocean to the shared sun each frame. Sun direction matches the baked
 * shadow light (not continuous reveal angles — keeps water spec/shadow aligned).
 * Look (color / distortion) follows todWeights.
 */
export function syncPantheonWater(
  water: PantheonWaterSyncTarget,
  sun: DirectionalLight,
  daylight: number,
): void {
  const elev = currentSunElevationDeg();
  const elevKey = elevBucket(elev);
  const w = runtimeSettings.water;

  copyBakedSunDirection(sun, _sunDir);
  const sunMoved = _lastSunDir.distanceToSquared(_sunDir) > 1e-8;
  if (sunMoved) {
    water.sunDirection.value.copy(_sunDir);
    _lastSunDir.copy(_sunDir);
  }
  if (elevKey !== lastElevBucket) {
    const stops = liveWaterStops();
    sampleTodColor(
      {
        night: stops.night.waterColor,
        goldenHour: stops.goldenHour.waterColor,
        noon: stops.noon.waterColor,
      },
      elev,
      _waterColor,
    );
    sampleTodColor(
      {
        night: stops.night.sunColor,
        goldenHour: stops.goldenHour.sunColor,
        noon: stops.noon.sunColor,
      },
      elev,
      _sunColor,
    );
    water.waterColor.value.copy(_waterColor);
    water.sunColor.value.copy(_sunColor);
    lastElevBucket = elevKey;
  }

  const stops = liveWaterStops();
  const distortion = sampleTodScalar(
    {
      night: stops.night.distortion,
      goldenHour: stops.goldenHour.distortion,
      noon: stops.noon.distortion,
    },
    elev,
  );
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
  if (water.reflectorTarget) {
    // Push headroom in whichever direction the offset points, so the tide bob can never carry
    // the surface across the mirror plane (a plane parked at base water Y was overtaken at
    // high tide and the waterline seam reappeared).
    const offset = w.reflectionPlaneOffsetM;
    const planeOffset = offset + Math.sign(offset) * surfaceHeadroomM();
    if (planeOffset !== lastPlaneOffset) {
      // Local +Z is world +Y here (water mesh is rotated -PI/2 on X), so negate: positive
      // offset drops the plane, negative lifts it.
      water.reflectorTarget.position.z = -planeOffset;
      lastPlaneOffset = planeOffset;
    }
  }

  if (water.shoreUniforms) {
    syncWaterShoreUniforms(water.shoreUniforms, daylight);
  }
  syncWaterWaveUniforms();
}
