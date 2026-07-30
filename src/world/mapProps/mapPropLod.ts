// src/world/mapProps/mapPropLod.ts — distance-banded InstancedMesh LOD for map props
import type { InstancedMesh, Matrix4 } from 'three';
import { getPropLodTuning } from './config/propLodConfig';
import type { MapPropPlacement } from './mapPropPlacement';

export type PropLodLevel = 0 | 1 | 2;

/** Sticky LOD sentinel: not yet classified (first rebin uses hard thresholds). */
const LOD_UNSET = -2;
/** Instance culled (beyond farMaxM). */
const LOD_CULLED = -1;

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
  /**
   * Per-instance sticky LOD (−2 unset, −1 culled, 0/1/2). Hysteresis uses this so
   * near↔mid↔far swaps do not thrash when the player walks the band edges.
   */
  lodLevels: Int8Array;
  lastRebinX: number;
  lastRebinZ: number;
  /** Force rebin on next update (e.g. after DEV distance change). */
  dirty: boolean;
}

const _binIndices: [number[], number[], number[]] = [[], [], []];

function classifyLodHard(
  distSq: number,
  nearMaxM: number,
  midMaxM: number,
  farMaxM: number,
): PropLodLevel | typeof LOD_CULLED {
  if (distSq <= nearMaxM * nearMaxM) return 0;
  if (distSq <= midMaxM * midMaxM) return 1;
  if (distSq <= farMaxM * farMaxM) return 2;
  return LOD_CULLED;
}

/**
 * Sticky distance bands: leave a LOD only after crossing the threshold by `marginM`.
 * Prevents synchronized pop when many props sit near the same cut and the player walks.
 */
function classifyLodSticky(
  distSq: number,
  prev: number,
  nearMaxM: number,
  midMaxM: number,
  farMaxM: number,
  marginM: number,
): PropLodLevel | typeof LOD_CULLED {
  if (prev === LOD_UNSET || marginM <= 0) {
    return classifyLodHard(distSq, nearMaxM, midMaxM, farMaxM);
  }

  const dist = Math.sqrt(distSq);
  const nearOut = nearMaxM + marginM;
  const nearIn = Math.max(0, nearMaxM - marginM);
  const midOut = midMaxM + marginM;
  const midIn = Math.max(nearMaxM, midMaxM - marginM);
  const farOut = farMaxM + marginM;
  const farIn = Math.max(midMaxM, farMaxM - marginM);

  if (prev === 0) {
    if (dist > nearOut) return dist <= midMaxM ? 1 : dist <= farMaxM ? 2 : LOD_CULLED;
    return 0;
  }
  if (prev === 1) {
    if (dist <= nearIn) return 0;
    if (dist > midOut) return dist <= farMaxM ? 2 : LOD_CULLED;
    return 1;
  }
  if (prev === 2) {
    if (dist <= midIn) return dist <= nearMaxM ? 0 : 1;
    if (dist > farOut) return LOD_CULLED;
    return 2;
  }
  // Culled: only re-enter once clearly inside far band.
  if (dist <= farIn) {
    if (dist <= nearMaxM) return 0;
    if (dist <= midMaxM) return 1;
    return 2;
  }
  return LOD_CULLED;
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

    const { matrices, placements, lodMeshes, lodLevels } = group;

    if (!tuning.enabled) {
      // All instances on lod0; lod1/2 empty.
      const allIdx = placements.map((_, i) => i);
      lodLevels.fill(0);
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
      const lod = classifyLodSticky(
        ddx * ddx + ddz * ddz,
        lodLevels[i]!,
        tuning.nearMaxM,
        tuning.midMaxM,
        tuning.farMaxM,
        tuning.hysteresisM,
      );
      lodLevels[i] = lod;
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
  for (const g of groups) {
    g.dirty = true;
    // Reset sticky state so new distance thresholds take effect immediately.
    g.lodLevels.fill(LOD_UNSET);
  }
}

/** Allocate sticky LOD state for a new group (all unset until first rebin). */
export function createPropLodLevels(count: number): Int8Array {
  return new Int8Array(count).fill(LOD_UNSET);
}
