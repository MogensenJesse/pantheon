// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/compute/shared/vegetationIndirectTsl.ts — shared indirect draw + compaction helpers
import { atomicAdd, atomicStore, Fn, float, If, instanceIndex, struct, uint } from 'three/tsl';
import type { ComputeNode } from 'three/webgpu';

export const vegetationDrawIndirectStruct = struct(
  {
    vertexCount: 'uint',
    instanceCount: { type: 'uint', atomic: true },
    firstVertex: 'uint',
    firstInstance: 'uint',
    offset: 'uint',
  },
  'VegetationDrawIndirect',
);

/** Byte offset of instanceCount within the indirect draw buffer (Uint32 index 1). */
export const VEGETATION_INDIRECT_INSTANCE_COUNT_OFFSET = 4;

export function createAppendCompact(drawStorage, visibleIndices) {
  return (isVisible) => {
    If(isVisible.greaterThan(float(0)), () => {
      const dst = atomicAdd(drawStorage.get('instanceCount'), uint(1));
      visibleIndices.element(dst).assign(instanceIndex);
    });
  };
}

export function createComputeInitIndirect(drawStorage, indexCount): ComputeNode {
  return Fn(() => {
    drawStorage.get('vertexCount').assign(uint(indexCount));
    atomicStore(drawStorage.get('instanceCount'), uint(0));
    drawStorage.get('firstVertex').assign(uint(0));
    drawStorage.get('firstInstance').assign(uint(0));
    drawStorage.get('offset').assign(uint(0));
  })().compute(1);
}

export function createComputeCompactReset(drawStorage): ComputeNode {
  return Fn(() => {
    atomicStore(drawStorage.get('instanceCount'), uint(0));
  })().compute(1);
}
