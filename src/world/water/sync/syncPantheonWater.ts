// src/world/water/sync/syncPantheonWater.ts — per-frame sun + tod drive for WaterMesh

import type { DirectionalLight } from 'three';
import { Color, Vector3 } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { copyBakedSunDirection } from '../../../rendering/sunShadow/bakedSunDirection';
import { currentSunElevationDeg } from '../../../rendering/sunSpherical';
import { sampleTodColor, sampleTodScalar } from '../../../rendering/tod/todBlend';
import type { PantheonWaterSyncTarget } from '../mesh/pantheonWaterTypes';
import { swellTotalHeightM } from '../waves/waveMath';
import {
  currentSwashPeakM,
  currentWaveEnergy,
  syncWaterWaveUniforms,
} from './syncWaterWaveUniforms';
import { syncWaterShoreUniforms } from './waterShoreSync';

const _sunDir = new Vector3();
const _waterColor = new Color();
const _sunColor = new Color();

/**
 * How far the vertex shader can move the surface from base water Y, in either direction.
 */
function surfaceHeadroomM(): number {
  return (
    swellTotalHeightM(VISUAL.water.waves.swell, currentWaveEnergy()) +
    currentSwashPeakM() +
    VISUAL.water.waves.mesh.edgeLiftM
  );
}

/** The reflector clears its image while the camera is below its mirror plane, so the plane stays at least this far (m) under the eye. */
const EYE_OVER_PLANE_M = 0.3;

const _lastSunDir = new Vector3();
let lastSize = Number.NaN;
let lastAlpha = Number.NaN;
let lastDistortion = Number.NaN;

/**
 * Syncs the ocean to the shared sun each frame. Sun direction matches the baked
 * shadow light (not continuous reveal angles — keeps water spec/shadow aligned).
 * Look (color / distortion / shallow) follows todWeights every frame so ToD
 * panel edits apply without waiting for an elevation change.
 * `cameraAboveWaterM` (camera height over the mean level) keeps the mirror plane under the eye: a low camera (standing at
 * the water, looking at the horizon) would otherwise sit below the lifted plane and lose the reflection.
 */
export function syncPantheonWater(
  water: PantheonWaterSyncTarget,
  sun: DirectionalLight,
  cameraAboveWaterM = Number.POSITIVE_INFINITY,
): void {
  const elev = currentSunElevationDeg();
  const w = VISUAL.water;
  const stops = w.stops;

  copyBakedSunDirection(sun, _sunDir);
  const sunMoved = _lastSunDir.distanceToSquared(_sunDir) > 1e-8;
  if (sunMoved) {
    water.sunDirection.value.copy(_sunDir);
    _lastSunDir.copy(_sunDir);
  }

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
  // before the plane: the headroom reads this frame's wave energy and swash peak
  syncWaterWaveUniforms();
  if (water.reflectorTarget) {
    // Push headroom in whichever direction the offset points, so the swell can never carry
    // the surface across the mirror plane (a plane parked at base water Y was overtaken by
    // the surface and the waterline seam reappeared). An offset of exactly 0 lifts.
    const offset = w.reflectionPlaneOffsetM;
    const planeOffset = offset + (Math.sign(offset) || -1) * surfaceHeadroomM();
    // Plane height over the mean level (local +Z is world +Y here: the water mesh is rotated -PI/2 on X; a positive offset
    // drops the plane, a negative one lifts it). Never above the eye, but never below the mean level for that reason alone.
    const eyeCapM = Math.max(cameraAboveWaterM - EYE_OVER_PLANE_M, 0);
    water.reflectorTarget.position.z = Math.min(-planeOffset, eyeCapM);
  }

  if (water.shoreUniforms) {
    syncWaterShoreUniforms(water.shoreUniforms);
  }
}
