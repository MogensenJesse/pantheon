// src/world/water/updateWaterReflectionQuality.ts — adaptive reflector resolutionScale
import { MathUtils, type Vector3 } from 'three';
import { VISUAL, type WaterTier } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { WORLD } from '../WorldConfig';
import type { PantheonWaterSyncTarget } from './pantheonWaterTypes';

const { adaptive } = VISUAL.water;

let smoothedScale: number = VISUAL.water.resolutionScale;

function shoreWeight(playerX: number, playerZ: number): number {
  const half = WORLD.SIZE * 0.5;
  const edgeDist = Math.min(half - Math.abs(playerX), half - Math.abs(playerZ));
  const start = adaptive.shoreDistanceStart;
  const end = adaptive.shoreDistanceEnd;
  return 1 - MathUtils.smoothstep(edgeDist, end, start);
}

function horizonWeight(cameraPitchRad: number): number {
  const pitchDeg = MathUtils.radToDeg(cameraPitchRad);
  return MathUtils.smoothstep(pitchDeg, adaptive.pitchLowDeg, adaptive.pitchHighDeg);
}

/**
 * Drives runtime `resolutionScale` from shore distance, camera pitch, and daylight.
 * Skipped for cheap tier (no reflector). Dev slider sets the ceiling.
 */
export function updateWaterReflectionQuality(
  water: PantheonWaterSyncTarget,
  playerPosition: Vector3,
  cameraPitchRad: number,
  daylight: number,
  deltaSeconds: number,
): void {
  if ((VISUAL.water.tier as WaterTier) === 'cheap') return;

  const devMax = devSettings.water.resolutionScale;
  const shore = shoreWeight(playerPosition.x, playerPosition.z);
  const horizon = horizonWeight(cameraPitchRad);
  const day = MathUtils.smoothstep(daylight, adaptive.daylightNight, 1);

  const importance = Math.max(shore * horizon * day, adaptive.inlandFloor);
  const target = MathUtils.lerp(adaptive.minScale, devMax, importance);

  smoothedScale = MathUtils.damp(smoothedScale, target, adaptive.dampLambda, deltaSeconds);
  water.resolutionScale = smoothedScale;
}
