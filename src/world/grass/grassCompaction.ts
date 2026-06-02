// src/world/grass/grassCompaction.ts — Tier 3A design notes (not yet implemented)
//
// Profiling shows grass is draw-bound: InstancedMesh still invokes the vertex shader for
// all `count` instances even when SSBO visibility is 0 (opacity + offscreen push).
//
// Intended approach when Three.js WebGPU exposes GPU-driven indirect instancing:
// 1. computeCompact — parallel scan / atomic append of visible instance indices
// 2. material reads packed.element(compactIndices.element(instanceIndex))
// 3. drawIndirect with instance count from GPU buffer (no CPU readback per frame)
//
// Three r184 has no public drawIndirect / indirect InstancedMesh path in this repo.
// Until then, Tier 2 (merged data, adaptive compute) is the compute-side ceiling.
//
// Tier 3B (implemented): dual draw — near ring full segments, far ring `lodFarSegments`
// with `ssboIndex` instanced remap; LOD rings repartition from CPU tile offsets on wrap.
// See grassLodField.ts / grassTileOffsets.ts.

export const GRASS_COMPACTION_TIER = 3 as const;
