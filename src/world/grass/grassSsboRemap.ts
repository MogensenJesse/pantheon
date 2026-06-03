// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassSsboRemap.ts — draw instanceIndex → SSBO slot (Tier 3A compaction)
import type { InstancedBufferAttribute } from 'three';
import { instancedArray } from 'three/tsl';

export interface GrassSsboRemapBinding {
  remapStorage: ReturnType<typeof instancedArray>;
  slotNode: ReturnType<ReturnType<typeof instancedArray>['toAttribute']>;
  geometryAttribute: InstancedBufferAttribute;
}

/** GPU compact-index buffer + vertex attribute for SpriteNodeMaterial instancing. */
export function createGrassSsboRemap(instanceCount: number): GrassSsboRemapBinding {
  const remapStorage = instancedArray(instanceCount, 'uint');
  const geometryAttribute = remapStorage.value as InstancedBufferAttribute;
  const slotNode = remapStorage.toAttribute();
  return { remapStorage, slotNode, geometryAttribute };
}
