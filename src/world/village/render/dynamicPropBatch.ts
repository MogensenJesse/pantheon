// src/world/village/render/dynamicPropBatch.ts — growable instance batch over a dynamic PropLodGroup
import type { DirectionalLight, InstancedMesh, Matrix4 } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import { VISUAL } from '../../../config/visualTuning';
import {
  buildDynamicPropLodGroup,
  flattenPropLodMeshes,
  type PropMaterialResolver,
} from '../../mapProps/mapPropInstancing';
import { markPropLodGroupsDirty, type PropLodGroup } from '../../mapProps/mapPropLod';
import { computeModelFootLocal } from '../../mapProps/resolvePropInstanceMatrix';

export interface DynamicPropBatch {
  readonly group: PropLodGroup;
  /** Every InstancedMesh (all LODs and submeshes). */
  readonly meshes: InstancedMesh[];
  /** Model base offset: seat the base on a surface with y = surfaceY - footY. */
  readonly footY: number;
  /** Returns a stable handle, or 0 when the batch is full. */
  add: (x: number, z: number, matrix: Matrix4) => number;
  set: (handle: number, x: number, z: number, matrix: Matrix4) => void;
  remove: (handle: number) => void;
  /** Frees the geometry (the materials belong to whoever resolved them). */
  dispose: () => void;
}

interface DynamicPropBatchOptions {
  sun: DirectionalLight;
  key: string;
  asset: PropLodAsset;
  capacity: number;
  castsShadow: boolean;
  resolveMaterials?: PropMaterialResolver;
}

export function createDynamicPropBatch(options: DynamicPropBatchOptions): DynamicPropBatch {
  const { sun, key, asset, capacity, castsShadow, resolveMaterials } = options;
  const group = buildDynamicPropLodGroup(sun, key, asset, capacity, castsShadow, resolveMaterials);
  const meshes = flattenPropLodMeshes(group);
  const footY = computeModelFootLocal(asset.lod0).y;

  const shadowMax = VISUAL.props.lod.shadowCastMaxLod;
  group.lodMeshes.forEach((band, lod) => {
    for (const mesh of band) mesh.castShadow = castsShadow && lod <= shadowMax;
  });

  const handles: number[] = [];
  const indexOf = new Map<number, number>();
  let nextHandle = 1;

  const writePlacement = (index: number, x: number, z: number, matrix: Matrix4) => {
    const placement = group.placements[index];
    if (placement) {
      placement.x = x;
      placement.z = z;
    } else {
      group.placements[index] = { x, z, yRotation: 0, scale: 1, surfaceLift: 0 };
    }
    const target = group.matrices[index];
    if (target) target.copy(matrix);
    else group.matrices[index] = matrix.clone();
  };

  return {
    group,
    meshes,
    footY,
    add: (x, z, matrix) => {
      if (handles.length >= capacity) return 0;
      const index = handles.length;
      const handle = nextHandle++;
      handles.push(handle);
      indexOf.set(handle, index);
      writePlacement(index, x, z, matrix);
      group.dirty = true;
      return handle;
    },
    set: (handle, x, z, matrix) => {
      const index = indexOf.get(handle);
      if (index === undefined) return;
      writePlacement(index, x, z, matrix);
      group.dirty = true;
    },
    remove: (handle) => {
      const index = indexOf.get(handle);
      if (index === undefined) return;
      const last = handles.length - 1;
      if (index !== last) {
        const lastHandle = handles[last]!;
        handles[index] = lastHandle;
        indexOf.set(lastHandle, index);
        writePlacement(
          index,
          group.placements[last]!.x,
          group.placements[last]!.z,
          group.matrices[last]!,
        );
      }
      handles.pop();
      group.placements.length = handles.length;
      group.matrices.length = handles.length;
      indexOf.delete(handle);
      // Sticky LOD levels belong to slots, which just moved: classify everything afresh.
      markPropLodGroupsDirty([group]);
    },
    dispose: () => {
      for (const mesh of meshes) mesh.geometry.dispose();
    },
  };
}
