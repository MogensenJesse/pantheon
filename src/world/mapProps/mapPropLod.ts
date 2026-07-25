// src/world/mapProps/mapPropLod.ts — distance-banded InstancedMesh LOD for map props
import type { InstancedMesh, Matrix4 } from 'three';
import { getPropLodTuning } from './config/propLodConfig';
import type { MapPropPlacement } from './mapPropPlacement';

export type PropLodLevel = 0 | 1 | 2;

/**
 * Per prop-key LOD group: shared placement matrices, one InstancedMesh[] per LOD
 * (each array aligned by source submesh index).
 */
export interface PropLodGroup {
  key: string;
  placements: MapPropPlacement[];
  /** Precomputed instance matrices (shared across LODs — same placement). */
  matrices: Matrix4[];
  /** lodMeshes[lod][submeshIndex] */
  lodMeshes: [InstancedMesh[], InstancedMesh[], InstancedMesh[]];
  lastRebinX: number;
  lastRebinZ: number;
  /** Force rebin on next update (e.g. after DEV distance change). */
  dirty: boolean;
}

const _binIndices: [number[], number[], number[]] = [[], [], []];

function classifyLod(
  distSq: number,
  nearMaxM: number,
  midMaxM: number,
  farMaxM: number,
): PropLodLevel | -1 {
  const nearSq = nearMaxM * nearMaxM;
  const midSq = midMaxM * midMaxM;
  const farSq = farMaxM * farMaxM;
  if (distSq <= nearSq) return 0;
  if (distSq <= midSq) return 1;
  if (distSq <= farSq) return 2;
  return -1;
}

function applyBinToMeshes(meshes: InstancedMesh[], matrices: Matrix4[], indices: number[]): void {
  const count = indices.length;
  for (const mesh of meshes) {
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, matrices[indices[i]]);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = count > 0;
    if (count > 0) mesh.computeBoundingSphere();
  }
}

/**
 * Rebin placements into lod0/1/2 InstancedMeshes when the player has moved
 * farther than `rebinThresholdM` (or group.dirty / disabled→all lod0).
 */
export function updatePropLod(groups: PropLodGroup[], playerX: number, playerZ: number): void {
  const tuning = getPropLodTuning();
  const thresh = tuning.rebinThresholdM;
  const threshSq = thresh * thresh;

  for (const group of groups) {
    const dx = playerX - group.lastRebinX;
    const dz = playerZ - group.lastRebinZ;
    if (!group.dirty && dx * dx + dz * dz < threshSq) continue;

    group.lastRebinX = playerX;
    group.lastRebinZ = playerZ;
    group.dirty = false;

    const { matrices, placements, lodMeshes } = group;

    if (!tuning.enabled) {
      // All instances on lod0; lod1/2 empty.
      const allIdx = placements.map((_, i) => i);
      applyBinToMeshes(lodMeshes[0], matrices, allIdx);
      applyBinToMeshes(lodMeshes[1], matrices, []);
      applyBinToMeshes(lodMeshes[2], matrices, []);
      continue;
    }

    _binIndices[0].length = 0;
    _binIndices[1].length = 0;
    _binIndices[2].length = 0;

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      const ddx = p.x - playerX;
      const ddz = p.z - playerZ;
      const lod = classifyLod(
        ddx * ddx + ddz * ddz,
        tuning.nearMaxM,
        tuning.midMaxM,
        tuning.farMaxM,
      );
      if (lod === 0) _binIndices[0].push(i);
      else if (lod === 1) _binIndices[1].push(i);
      else if (lod === 2) _binIndices[2].push(i);
    }

    applyBinToMeshes(lodMeshes[0], matrices, _binIndices[0]);
    applyBinToMeshes(lodMeshes[1], matrices, _binIndices[1]);
    applyBinToMeshes(lodMeshes[2], matrices, _binIndices[2]);
  }
}

/** Mark all groups dirty so the next frame rebins (DEV slider changes). */
export function markPropLodGroupsDirty(groups: PropLodGroup[]): void {
  for (const g of groups) g.dirty = true;
}
