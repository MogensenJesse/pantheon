// src/world/grass/grassSsboRemap.ts — draw instanceIndex → full SSBO slot (Tier 3B LOD rings)
import type { InstancedBufferAttribute } from 'three';
import { instancedArray } from 'three/tsl';

export interface GrassSsboRemapBinding {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remapStorage: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slotNode: any;
  geometryAttribute: InstancedBufferAttribute;
}

/**
 * Static remap table for a LOD ring.
 * Three.js pattern: instancedArray → toAttribute() for SpriteNodeMaterial instancing.
 */
export function createGrassSsboRemap(ssboIndices: Uint32Array): GrassSsboRemapBinding {
  const remapStorage = instancedArray(ssboIndices, 'uint');
  const geometryAttribute = remapStorage.value as InstancedBufferAttribute;
  const slotNode = remapStorage.toAttribute();
  return { remapStorage, slotNode, geometryAttribute };
}
