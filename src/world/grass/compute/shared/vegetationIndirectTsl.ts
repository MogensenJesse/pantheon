// src/world/grass/compute/shared/vegetationIndirectTsl.ts — shared indirect draw + compaction helpers
import { atomicAdd, atomicStore, Fn, float, If, instanceIndex, struct, uint } from 'three/tsl';
import type { ComputeNode } from 'three/webgpu';
import type { TslNode } from '../../tsl/tslNode';

/** Field order is the WebGPU `drawIndexedIndirect` argument layout. */
export const vegetationDrawIndirectStruct = struct(
  {
    indexCount: 'uint',
    instanceCount: { type: 'uint', atomic: true },
    firstIndex: 'uint',
    baseVertex: 'uint',
    firstInstance: 'uint',
  },
  'VegetationDrawIndirect',
);

export function createAppendCompact(drawStorage: TslNode, visibleIndices: TslNode) {
  return (isVisible: TslNode) => {
    If(isVisible.greaterThan(float(0)), () => {
      const dst = atomicAdd(drawStorage.get('instanceCount'), uint(1));
      visibleIndices.element(dst).assign(instanceIndex);
    });
  };
}

export function createComputeInitIndirect(drawStorage: TslNode, indexCount: number): ComputeNode {
  const node = Fn(() => {
    drawStorage.get('indexCount').assign(uint(indexCount));
    atomicStore(drawStorage.get('instanceCount'), uint(0));
    drawStorage.get('firstIndex').assign(uint(0));
    drawStorage.get('baseVertex').assign(uint(0));
    drawStorage.get('firstInstance').assign(uint(0));
  })().compute(1);
  node.name = 'vegetationInitIndirect';
  return node;
}

/**
 * Thread 0 zeroes instanceCount. Run it in the tile-mark kernel: compact appends from every
 * workgroup, so a reset inside that same dispatch races with the other workgroups' atomicAdd.
 */
export function resetIndirectInstanceCount(drawStorage: TslNode): void {
  If(instanceIndex.equal(uint(0)), () => {
    atomicStore(drawStorage.get('instanceCount'), uint(0));
  });
}
