// src/world/water/sync/updateWaterReflectionQuality.ts — adaptive reflector resolutionScale
import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import { VISUAL, type WaterTier } from '../../../config/visualTuning';
import { runtimeSettings } from '../../../core/GameState';
import type { PantheonWaterSyncTarget } from '../mesh/pantheonWaterTypes';
import { coastDistanceM } from './waterCoastProximity';

const { adaptive } = VISUAL.water;

/** Re-run the radial coast probe only after this much XZ movement (m). */
const COAST_PROBE_MOVE_EPS_M = 2;
const COAST_PROBE_MOVE_EPS_SQ = COAST_PROBE_MOVE_EPS_M * COAST_PROBE_MOVE_EPS_M;

/** Forward probe rings for looked-at water (m) — nearest hit wins, so front-loaded. */
const VIEW_WATER_PROBE_M = [15, 35, 60, 100, 160, 240, 320] as const;

const _camForward = new Vector3();

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
  return 1 - MathUtils.smoothstep(coastDistM, start, end);
}

function horizonWeight(cameraPitchRad: number): number {
  const pitchDeg = MathUtils.radToDeg(cameraPitchRad);
  return MathUtils.smoothstep(pitchDeg, adaptive.pitchLowDeg, adaptive.pitchHighDeg);
}

/**
 * Weight from water the camera is actually looking at, independent of where the player stands.
 *
 * The coast probe is player-centred, so looking across a canyon at a lake 100 m away scored 0
 * while that water filled half the screen. Probing forward answers "am I looking at water, and
 * how close is the nearest of it" for a few height samples. Distance to the *nearest* visible
 * water is what sets reflector sharpness — intersecting the view ray with the water plane instead
 * measured the far end, which runs to hundreds of metres whenever the camera is near level.
 */
function viewWaterWeight(
  camera: PerspectiveCamera,
  getWorldY: (x: number, z: number) => number,
  waterY: number,
): number {
  camera.getWorldDirection(_camForward);
  const forwardLen = Math.hypot(_camForward.x, _camForward.z);
  // Looking straight down: the proximity term already covers water under the player.
  if (forwardLen < 1e-4) return 0;
  const dirX = _camForward.x / forwardLen;
  const dirZ = _camForward.z / forwardLen;

  for (const dist of VIEW_WATER_PROBE_M) {
    const x = camera.position.x + dirX * dist;
    const z = camera.position.z + dirZ * dist;
    // Terrain above the surface means the water plane is buried here — keep walking outward.
    if (getWorldY(x, z) > waterY) continue;
    return 1 - MathUtils.smoothstep(dist, adaptive.viewWaterNearM, adaptive.viewWaterFarM);
  }
  return 0;
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
  camera: PerspectiveCamera,
): void {
  if ((VISUAL.water.tier as WaterTier) === 'cheap') return;

  const devMax = runtimeSettings.water.resolutionScale;
  const coastDist = coastDistanceCached(playerPosition.x, playerPosition.z, getWorldY, waterY);
  const shore = shoreWeightFromCoastDistance(coastDist);
  const horizon = horizonWeight(cameraPitchRad);
  const viewWater = viewWaterWeight(camera, getWorldY, waterY);
  // Either standing near water or looking at it keeps the reflector sharp.
  const quality = Math.max(shore * horizon, viewWater, adaptive.inlandFloor);
  const targetScale = MathUtils.lerp(adaptive.minScale, devMax, quality);

  smoothedScale = MathUtils.damp(smoothedScale, targetScale, adaptive.dampLambda, deltaSeconds);

  // Never set resolutionScale to 0 — ReflectorNode resizes its RT to 0×0 and WebGPU bind
  // groups then mismatch (multisampled vs single-sample validation errors).
  const scale = Math.max(smoothedScale, adaptive.minScale);
  water.resolutionScale = scale;
  if (water.waterReflector) {
    water.waterReflector.resolutionScale = scale;
  }
}
