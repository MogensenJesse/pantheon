// src/map/authoring/scaleMapHeight.ts — scale the authored heightfield to a target peak
import { clampHeightNorm } from '../mapHeightBounds.ts';

const FLAT_PEAK_EPS = 1e-6;

/** Highest normalized height in the grid (may be signed). */
export function scanHeightPeak(height: Float32Array): number {
  let peak = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < height.length; i++) {
    const h = height[i]!;
    if (h > peak) peak = h;
  }
  return Number.isFinite(peak) ? peak : 0;
}

/**
 * Write dest from `source` so the landform peak becomes `targetPeak` (0–1).
 * Flat source (peak ≈ 0) becomes a uniform plateau at the target — sculpting
 * can still raise toward 1. Does not change WORLD.HEIGHT_SCALE.
 */
export function scaleHeightFromSource(
  destHeight: Float32Array,
  destSculptBase: Float32Array,
  source: Float32Array,
  targetPeak: number,
  sourcePeak: number,
): void {
  const target = clampHeightNorm(targetPeak);
  const len = destHeight.length;
  if (sourcePeak < FLAT_PEAK_EPS) {
    for (let i = 0; i < len; i++) {
      destHeight[i] = target;
      destSculptBase[i] = target;
    }
    return;
  }
  const scale = target / sourcePeak;
  for (let i = 0; i < len; i++) {
    const next = clampHeightNorm(source[i]! * scale);
    destHeight[i] = next;
    destSculptBase[i] = next;
  }
}
