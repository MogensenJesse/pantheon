// src/world/water/updateWaterReflectionQuality.ts — adaptive reflector resolutionScale

import { MathUtils, type Vector3 } from 'three';

import { VISUAL, type WaterTier } from '../../config/visualTuning';

import { runtimeSettings } from '../../core/GameState';
import type { PantheonWaterSyncTarget } from './pantheonWaterTypes';
import { coastDistanceM } from './waterCoastProximity';

const { adaptive } = VISUAL.water;

let smoothedScale: number = VISUAL.water.resolutionScale;

function shoreWeightFromCoastDistance(coastDistM: number): number {
  const start = adaptive.shoreDistanceStart;

  const end = adaptive.shoreDistanceEnd;

  if (coastDistM > adaptive.coastMaxSearchM) {
    return 0;
  }

  return 1 - MathUtils.smoothstep(coastDistM, end, start);
}

function horizonWeight(cameraPitchRad: number): number {
  const pitchDeg = MathUtils.radToDeg(cameraPitchRad);

  return MathUtils.smoothstep(pitchDeg, adaptive.pitchLowDeg, adaptive.pitchHighDeg);
}

/**

 * Drives runtime `resolutionScale` from coast proximity and camera pitch.

 * Reflection mix stays at 1 — weight was tied to quality and blacked out water when

 * looking down or standing inland while water was still in view.

 * Skipped for cheap tier (no reflector). Dev slider sets the RT ceiling.

 */

export function updateWaterReflectionQuality(
  water: PantheonWaterSyncTarget,

  playerPosition: Vector3,

  cameraPitchRad: number,

  deltaSeconds: number,

  getWorldY: (x: number, z: number) => number,

  waterY: number,
): void {
  if ((VISUAL.water.tier as WaterTier) === 'cheap') return;

  const devMax = runtimeSettings.water.resolutionScale;

  const coastDist = coastDistanceM(playerPosition.x, playerPosition.z, getWorldY, waterY);

  const shore = shoreWeightFromCoastDistance(coastDist);

  const horizon = horizonWeight(cameraPitchRad);

  const quality = Math.max(shore * horizon, adaptive.inlandFloor);

  const idleScale = adaptive.reflectorIdleScale;

  const targetScale =
    quality < adaptive.reflectorCutoff
      ? idleScale
      : MathUtils.lerp(adaptive.minScale, devMax, quality);

  smoothedScale = MathUtils.damp(smoothedScale, targetScale, adaptive.dampLambda, deltaSeconds);

  // Never set resolutionScale to 0 — ReflectorNode resizes its RT to 0×0 and WebGPU bind

  // groups then mismatch (multisampled vs single-sample validation errors).

  water.resolutionScale = Math.max(smoothedScale, adaptive.reflectorIdleScale);

  water.reflectorWeight = 1;

  if (water.uReflectorWeight) {
    water.uReflectorWeight.value = 1;
  }
}
