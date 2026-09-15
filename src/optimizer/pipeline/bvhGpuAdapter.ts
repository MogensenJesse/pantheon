// src/optimizer/pipeline/bvhGpuAdapter.ts — isolated three-mesh-bvh@0.9.15 BVHComputeData wrapper
import type { BufferGeometry, Object3D } from 'three';
import { BVHComputeData } from 'three-mesh-bvh/webgpu';

import { MAX_BVH_STORAGE_BYTES } from './limits';

const MAX_STORAGE_BYTES = MAX_BVH_STORAGE_BYTES;

export type BvhGpuAdapter = {
  data: BVHComputeData;
  update: () => void;
  storageBytes: () => number;
  assertBudget: () => void;
  dispose: () => void;
};

export function createBvhGpuAdapter(
  source: Object3D | BufferGeometry | Array<Object3D | BufferGeometry>,
): BvhGpuAdapter {
  if (typeof BVHComputeData !== 'function') {
    throw new Error('BVHComputeData is unavailable. Pin three-mesh-bvh@0.9.15 and three r185+.');
  }
  const data = new BVHComputeData(source as Object3D, {
    attributes: {
      position: 'vec4f',
      uv: 'vec4f',
      normal: 'vec4f',
      tangent: 'vec4f',
      color: 'vec4f',
      materialId: 'vec4f',
    },
    autogenerateBvh: true,
  });

  const storageBytes = (): number => {
    const storage = data.storage as {
      index?: { value?: { array?: ArrayLike<unknown> } };
      attributes?: { value?: { array?: ArrayLike<unknown> } };
      nodes?: { value?: { array?: ArrayLike<unknown> } };
    };
    const len = (buf?: { value?: { array?: ArrayLike<unknown> } }) => {
      const arr = buf?.value?.array;
      if (!arr) return 0;
      return (arr as { byteLength?: number }).byteLength ?? (arr as ArrayLike<unknown>).length * 4;
    };
    return len(storage.index) + len(storage.attributes) + len(storage.nodes);
  };

  return {
    data,
    update: () => {
      data.update();
    },
    storageBytes,
    assertBudget: () => {
      const bytes = storageBytes();
      if (bytes > MAX_STORAGE_BYTES) {
        throw new Error(
          `BVH GPU storage ${Math.round(bytes / (1024 * 1024))} MiB exceeds the ${Math.round(MAX_STORAGE_BYTES / (1024 * 1024))} MiB safety gate.`,
        );
      }
    },
    dispose: () => {
      (data as { dispose?: () => void }).dispose?.();
    },
  };
}
