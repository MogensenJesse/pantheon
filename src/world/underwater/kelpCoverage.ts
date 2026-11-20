// src/world/underwater/kelpCoverage.ts — where kelp grows: a band of depth, in blobs (pure, node-runnable)
//
// Kelp is grass blades (`world/grass`). The grass data map keeps this 0..1 weight in its alpha, baked on the CPU with
// the rest of the map; the grass shaders read it. `noise01` is smooth value noise at the patch size.

import { smoothstepEdges } from '../../core/math/scalar.ts';

/** Metres over which kelp fades in at the shallow end of its band and out at the deep end. */
const FADE_IN_M = 1;
const FADE_OUT_M = 2;
/** Softness of a patch's rim, in noise units. */
const PATCH_SOFT = 0.1;

/** Weight 0..1 of kelp on a sea floor `depthM` under the water, in a patch of `patchShare` of the map. */
export function kelpCoverage(
  depthM: number,
  noise01: number,
  depthBand: readonly [number, number],
  patchShare: number,
): number {
  const [shallow, deep] = depthBand;
  const band =
    smoothstepEdges(shallow, shallow + FADE_IN_M, depthM) *
    (1 - smoothstepEdges(deep - FADE_OUT_M, deep, depthM));
  const edge = 1 - patchShare;
  return band * smoothstepEdges(edge - PATCH_SOFT, edge + PATCH_SOFT, noise01);
}
