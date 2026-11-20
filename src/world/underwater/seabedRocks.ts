// src/world/underwater/seabedRocks.ts — rocks on the sea floor, placed at load as ordinary map props
//
// Pure and node-runnable (`scripts/checks/underwater`). The result is a list of `prop` entities the prop pipeline spawns
// like any authored prop (instanced LODs, shadows, fog, caustics), so nothing here touches the renderer. Nothing is saved in
// the map: the same terrain always gives the same rocks.

import { underwater } from '../../config/visual/underwater.ts';
import { hash2 } from '../../core/math/hash2.ts';
import type { MapEntity } from '../../map/MapTypes.ts';

type PropEntity = Extract<MapEntity, { type: 'prop' }>;

const R = underwater.seabed.rocks;
const SEED = 0x5ea0b3d;
/** Distance (m) of the two samples the slope is measured over. */
const SLOPE_STEP_M = 2;

/** The prop keys the rocks use: the play asset batch loads these along with the map's own. */
export const SEABED_ROCK_KEYS: readonly string[] = underwater.enabled ? R.keys : [];

/**
 * Rocks for a sea of level `waterLevelM` over `size` x `size` metres of terrain centred on the origin. `groundY` is the
 * terrain height at a world point; `landmarks` are kept clear of rocks (`landmarkClearM` times their scale).
 */
export function seabedRockEntities(
  groundY: (x: number, z: number) => number,
  waterLevelM: number,
  size: number,
  landmarks: readonly { x: number; z: number; scale?: number }[] = [],
): PropEntity[] {
  if (!underwater.enabled) return [];
  const half = size / 2;
  const cells = Math.floor(size / R.cellM);
  const [minDepth, maxDepth] = R.depthM;

  const fits = (x: number, z: number): boolean => {
    const y = groundY(x, z);
    const depth = waterLevelM - y;
    if (depth < minDepth || depth > maxDepth) return false;
    const rise = Math.hypot(
      groundY(x + SLOPE_STEP_M, z) - groundY(x - SLOPE_STEP_M, z),
      groundY(x, z + SLOPE_STEP_M) - groundY(x, z - SLOPE_STEP_M),
    );
    if (rise / (2 * SLOPE_STEP_M) > R.maxSlope) return false;
    return !landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < R.landmarkClearM * (l.scale ?? 1));
  };

  // One jittered point per cell; first count those that fit, then keep an even share of them so a big sea is thinned
  // everywhere instead of filling up from the first rows.
  const candidates: { x: number; z: number; ix: number; iz: number }[] = [];
  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const x = -half + (ix + hash2(ix, iz, SEED)) * R.cellM;
      const z = -half + (iz + hash2(ix, iz, SEED + 1)) * R.cellM;
      if (fits(x, z)) candidates.push({ x, z, ix, iz });
    }
  }
  const keep = Math.min(1, R.maxCount / Math.max(1, candidates.length));

  const rocks: PropEntity[] = [];
  const [scaleMin, scaleMax] = R.scale;
  for (const { x, z, ix, iz } of candidates) {
    if (hash2(ix, iz, SEED + 2) >= keep) continue;
    const scale = scaleMin * (scaleMax / scaleMin) ** hash2(ix, iz, SEED + 3);
    const key = R.keys[Math.floor(hash2(ix, iz, SEED + 4) * R.keys.length)];
    rocks.push({
      type: 'prop',
      key,
      x,
      z,
      rotY: hash2(ix, iz, SEED + 5) * Math.PI * 2,
      scale,
      // sunk into the sand in proportion to its size (the stone pack's rocks are about 0.7 to 2.3 m high at scale 1)
      surfaceLift: -R.sink * scale,
    });
  }
  return rocks;
}
