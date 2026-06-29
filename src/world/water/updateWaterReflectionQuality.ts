// src/world/water/updateWaterReflectionQuality.ts — adaptive reflector resolutionScale
import { MathUtils, type Vector3 } from 'three';
import { VISUAL, type WaterTier } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { coastDistanceM } from './waterCoastProximity';
import type { PantheonWaterSyncTarget } from './pantheonWaterTypes';

const { adaptive } = VISUAL.water;

let smoothedScale: number = VISUAL.water.resolutionScale;
let smoothedReflectorWeight = 1;

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
 * Drives runtime `resolutionScale` and `reflectorWeight` from coast proximity, camera pitch,
 * and daylight. Skipped for cheap tier (no reflector). Dev slider sets the ceiling.
 */
export function updateWaterReflectionQuality(
  water: PantheonWaterSyncTarget,
  playerPosition: Vector3,
  cameraPitchRad: number,
  daylight: number,
  deltaSeconds: number,
  getWorldY: (x: number, z: number) => number,
  waterY: number,
): void {
  if ((VISUAL.water.tier as WaterTier) === 'cheap') return;

  const devMax = devSettings.water.resolutionScale;
  const coastDist = coastDistanceM(playerPosition.x, playerPosition.z, getWorldY, waterY);
  const shore = shoreWeightFromCoastDistance(coastDist);
  const horizon = horizonWeight(cameraPitchRad);
  const day = MathUtils.smoothstep(daylight, adaptive.daylightNight, 1);

  const importance = Math.max(shore * horizon * day, adaptive.inlandFloor);
  const targetWeight = importance < adaptive.reflectorCutoff ? 0 : importance;
  const idleScale = adaptive.reflectorIdleScale;
  const targetScale =
    targetWeight === 0
      ? idleScale
      : MathUtils.lerp(adaptive.minScale, devMax, importance);

  smoothedScale = MathUtils.damp(smoothedScale, targetScale, adaptive.dampLambda, deltaSeconds);
  smoothedReflectorWeight = MathUtils.damp(
    smoothedReflectorWeight,
    targetWeight,
    adaptive.dampLambda,
    deltaSeconds,
  );

  // Never set resolutionScale to 0 — ReflectorNode resizes its RT to 0×0 and WebGPU bind
  // groups then mismatch (multisampled vs single-sample validation errors). Inland savings
  // come from reflectorWeight → 0 (shader mix) plus minScale RT.
  water.resolutionScale = Math.max(smoothedScale, adaptive.reflectorIdleScale);
  water.reflectorWeight = smoothedReflectorWeight;
  if (water.uReflectorWeight) {
    water.uReflectorWeight.value = smoothedReflectorWeight;
  }
}
