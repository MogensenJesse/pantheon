// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassCompaction.ts — GPU visible-slot compaction (Tier 3A)
import type { InstancedBufferAttribute } from 'three';
import type { ComputeNode } from 'three/webgpu';
import {
  Fn,
  If,
  atomicAdd,
  atomicStore,
  instancedArray,
  instanceIndex,
  uint,
} from 'three/tsl';
import { GRASS_CONFIG } from './grassConfig';
import { unpackVisibility } from './grassSsboPack';
import { createGrassSsboRemap, type GrassSsboRemapBinding } from './grassSsboRemap';

export class GrassCompaction {
  readonly remap: GrassSsboRemapBinding;
  readonly visibleCounter: ReturnType<typeof instancedArray>;
  readonly counterAttribute: InstancedBufferAttribute;
  readonly computeReset: ComputeNode;
  readonly computeCompact: ComputeNode;
  readonly instanceCount: number;

  constructor(
    packedBuffer: ReturnType<typeof instancedArray>,
    instanceCount: number,
  ) {
    this.instanceCount = instanceCount;
    this.remap = createGrassSsboRemap(instanceCount);
    this.visibleCounter = instancedArray(1, 'uint');
    this.counterAttribute = this.visibleCounter.value as InstancedBufferAttribute;

    const compactIndices = this.remap.remapStorage;
    const atomicCounter = this.visibleCounter.toAtomic();

    this.computeReset = Fn(() => {
      atomicStore(atomicCounter.element(uint(0)), uint(0));
    })().compute(1, [1]);

    this.computeCompact = Fn(() => {
      const packed = packedBuffer.element(instanceIndex);
      const isVisible = unpackVisibility(packed.w);
      If(isVisible.greaterThan(0.5), () => {
        const idx = atomicAdd(atomicCounter.element(uint(0)), uint(1));
        compactIndices.element(idx).assign(uint(instanceIndex));
      });
    })().compute(instanceCount, [GRASS_CONFIG.WORKGROUP_SIZE]);
  }
}
