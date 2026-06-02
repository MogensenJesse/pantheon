// src/world/grass/grassLodTrace.ts — DEV validation for LOD remap tables
import { GRASS_CONFIG } from './grassConfig';
import { grassLodRadiusSq, partitionGrassLodIndices } from './grassLodPartition';

export interface GrassLodTraceReport {
  bladesPerSide: number;
  totalInstances: number;
  nearCount: number;
  farCount: number;
  lodRadius: number;
  /** First draw instance → SSBO slot. */
  nearRemap0: number;
  nearRemap1: number;
  nearRemap2: number;
  /** How many of the first 256 draw slots are sequential 0..255 (broken remap signature). */
  sequentialHead256: number;
  wedgeLikely: boolean;
}

export function traceGrassLodPartition(): GrassLodTraceReport {
  const bladesPerSide = Math.floor(GRASS_CONFIG.BLADES_PER_SIDE);
  const totalInstances = bladesPerSide * bladesPerSide;
  const { nearIndices, farIndices } = partitionGrassLodIndices(
    bladesPerSide,
    GRASS_CONFIG.TILE_SIZE,
    grassLodRadiusSq(),
  );

  let sequentialHead256 = 0;
  const head = Math.min(256, nearIndices.length);
  for (let i = 0; i < head; i++) {
    if (nearIndices[i] === i) sequentialHead256 += 1;
  }

  const wedgeLikely = sequentialHead256 > head * 0.9;

  return {
    bladesPerSide,
    totalInstances,
    nearCount: nearIndices.length,
    farCount: farIndices.length,
    lodRadius: GRASS_CONFIG.LOD_RADIUS,
    nearRemap0: nearIndices[0] ?? -1,
    nearRemap1: nearIndices[1] ?? -1,
    nearRemap2: nearIndices[2] ?? -1,
    sequentialHead256,
    wedgeLikely,
  };
}

export function logGrassLodTrace(label = 'partition'): void {
  const r = traceGrassLodPartition();
  console.info(`[grass/lod] ${label}`, {
    grid: `${r.bladesPerSide}×${r.bladesPerSide} = ${r.totalInstances.toLocaleString()}`,
    near: r.nearCount.toLocaleString(),
    far: r.farCount.toLocaleString(),
    lodRadiusM: r.lodRadius,
    'remap[0..2]': [r.nearRemap0, r.nearRemap1, r.nearRemap2],
    sequentialHead256: r.sequentialHead256,
    wedgeIfRemapIgnored: r.wedgeLikely
      ? 'YES — draw i would read SSBO i (corner wedge)'
      : 'no — CPU remap looks spread',
  });
}
