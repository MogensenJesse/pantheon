// src/world/water/sync/updateWaterReflectionQuality.ts — adaptive reflector resolutionScale
import { MathUtils, type Vector3 } from 'three';
import { VISUAL, type WaterTier } from '../../../config/visualTuning';
import { runtimeSettings } from '../../../core/GameState';
import type { PantheonWaterSyncTarget } from '../mesh/pantheonWaterTypes';
import { coastDistanceM } from './waterCoastProximity';

const { adaptive } = VISUAL.water;

/** Re-run the radial coast probe only after this much XZ movement (m). */
const COAST_PROBE_MOVE_EPS_M = 2;
const COAST_PROBE_MOVE_EPS_SQ = COAST_PROBE_MOVE_EPS_M * COAST_PROBE_MOVE_EPS_M;

let smoothedScale: number = VISUAL.water.resolutionScale;
let cachedCoastDistM = Number.NaN;
let lastProbeX = Number.NaN;
let lastProbeZ = Number.NaN;

/** Reset damped reflection scale when water is disposed (e.g. map switch). */
export function resetWaterReflectionQualityState(): void {
  smoothedScale = VISUAL.water.resolutionScale;
  cachedCoastDistM = Number.NaN;
  lastProbeX = Number.NaN;
  lastProbeZ = Number.NaN;
}

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
 * Cached coast distance — radial probe is expensive (up to ~72 getWorldY).
 * Damped scale already tolerates stale inputs between re-probes.
 */
function coastDistanceCached(
  px: number,
  pz: number,
  getWorldY: (x: number, z: number) => number,
  waterY: number,
): number {
  const moved =
    Number.isNaN(lastProbeX) ||
    (px - lastProbeX) ** 2 + (pz - lastProbeZ) ** 2 > COAST_PROBE_MOVE_EPS_SQ;
  if (!moved) {
    return cachedCoastDistM;
  }
  cachedCoastDistM = coastDistanceM(px, pz, getWorldY, waterY);
  lastProbeX = px;
  lastProbeZ = pz;
  return cachedCoastDistM;
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
  const coastDist = coastDistanceCached(playerPosition.x, playerPosition.z, getWorldY, waterY);
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
  const scale = Math.max(smoothedScale, adaptive.reflectorIdleScale);
  water.resolutionScale = scale;
  if (water.waterReflector) {
    water.waterReflector.resolutionScale = scale;
  }
}
