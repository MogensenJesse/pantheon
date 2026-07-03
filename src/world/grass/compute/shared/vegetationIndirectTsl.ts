// src/world/grass/compute/shared/vegetationIndirectTsl.ts — shared indirect draw + compaction helpers
import { atomicAdd, atomicStore, Fn, float, If, instanceIndex, struct, uint } from 'three/tsl';
import type { ComputeNode } from 'three/webgpu';
import type { TslNode } from '../../tsl/tslNode';

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

export function createAppendCompact(drawStorage: TslNode, visibleIndices: TslNode) {
  return (isVisible: TslNode) => {
    If(isVisible.greaterThan(float(0)), () => {
      const dst = atomicAdd(drawStorage.get('instanceCount'), uint(1));
      visibleIndices.element(dst).assign(instanceIndex);
    });
  };
}

export function createComputeInitIndirect(drawStorage: TslNode, indexCount: number): ComputeNode {
  return Fn(() => {
    drawStorage.get('vertexCount').assign(uint(indexCount));
    atomicStore(drawStorage.get('instanceCount'), uint(0));
    drawStorage.get('firstVertex').assign(uint(0));
    drawStorage.get('firstInstance').assign(uint(0));
    drawStorage.get('offset').assign(uint(0));
  })().compute(1);
}

/** Thread 0 resets instanceCount at the start of each compact kernel (replaces per-frame reset dispatch). */
export function resetIndirectInstanceCountAtKernelStart(drawStorage: TslNode): void {
  If(instanceIndex.equal(uint(0)), () => {
    atomicStore(drawStorage.get('instanceCount'), uint(0));
  });
}
