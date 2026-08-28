// src/optimizer/vendor/remeshAdapter.ts — pinned experimental remesher (not published meshoptimizer)
import {
  MeshoptSimplifier,
  type RemesherFlags,
} from './meshopt_remesher/meshopt_simplifier.js';

export const REMESHER_COMMIT = 'ed895f0f58ee828598be46a026c24eff4d4b76c4';

export type ExposedRemeshFlag = Extract<RemesherFlags, 'Shell' | 'Solve'>;

export async function whenRemesherReady(): Promise<void> {
  if (!MeshoptSimplifier.supported) {
    throw new Error('Vendored meshoptimizer remesher WASM is not supported in this environment');
  }
  await MeshoptSimplifier.ready;
}

/**
 * Voxel remesh → unindexed position soup (3 floats per corner).
 * Resolution is clamped to the snapshot's 4–256 range.
 */
export function remeshPositions(
  indices: Uint32Array,
  positions: Float32Array,
  resolution: number,
  flags: ExposedRemeshFlag[],
): Float32Array {
  const res = Math.min(256, Math.max(4, Math.round(resolution)));
  return MeshoptSimplifier.remesh(indices, positions, 3, res, flags);
}

export { MeshoptSimplifier as VendoredMeshoptSimplifier };
