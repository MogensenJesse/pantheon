// src/world/terrain/cpu/terrainChiselCpu.ts — CPU twin of GPU mesh-grid chisel (footing + shadows)
import type { Vector3 } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { runtimeSettings } from '../../../core/state/runtimeSettings';
import { type MapGrids, sampleHeightBilinear } from '../../../map/MapGrids';
import { WORLD } from '../../WorldConfig';

const HEIGHT_SCALE = WORLD.HEIGHT_SCALE;
const WORLD_SIZE = WORLD.SIZE;
/** Barycentric hypot altitude → UV so crease width matches axis edges in world metres. */
const INV_SQRT2 = Math.SQRT1_2;

const _nSelf = { x: 0, y: 1, z: 0 };
const _nNeighbor = { x: 0, y: 1, z: 0 };

export function terrainFacetStepM(): number {
  return Math.max(VISUAL.terrain.chisel.stepM, 1e-3);
}

function liveChiselEdgeSoft(): number {
  return Math.min(1, Math.max(0, runtimeSettings.terrain.chisel.edgeSoft));
}

/** Play + editor PlaneGeometry subdivisions so vertex step equals facet size. */
export function terrainMeshSegments(): number {
  return Math.max(1, Math.round(WORLD_SIZE / terrainFacetStepM()));
}

export function sampleSmoothWorldY(grids: MapGrids, x: number, z: number): number {
  return sampleHeightBilinear(grids, x, z, WORLD_SIZE) * HEIGHT_SCALE;
}

function facetCell(
  x: number,
  z: number,
  stepM: number,
): {
  ox: number;
  oz: number;
  tx: number;
  ty: number;
  upper: boolean;
} {
  const inv = 1 / stepM;
  const fx = x * inv;
  const fz = z * inv;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const ty = fz - iz;
  return { ox: ix * stepM, oz: iz * stepM, tx, ty, upper: tx + ty >= 1 };
}

function meshGridWorldYAtStep(grids: MapGrids, x: number, z: number, stepM: number): number {
  const { ox, oz, tx, ty, upper } = facetCell(x, z, stepM);
  const y00 = sampleSmoothWorldY(grids, ox, oz);
  const y10 = sampleSmoothWorldY(grids, ox + stepM, oz);
  const y01 = sampleSmoothWorldY(grids, ox, oz + stepM);
  const y11 = sampleSmoothWorldY(grids, ox + stepM, oz + stepM);
  if (!upper) {
    return y00 * (1 - tx - ty) + y01 * ty + y10 * tx;
  }
  return y01 * (1 - tx) + y11 * (tx + ty - 1) + y10 * (1 - ty);
}

function writeFaceNormal(
  target: { x: number; y: number; z: number },
  nx: number,
  ny: number,
  nz: number,
): void {
  const len = Math.hypot(nx, ny, nz) || 1;
  target.x = nx / len;
  target.y = ny / len;
  target.z = nz / len;
}

function meshGridFaceNormalAtStep(
  grids: MapGrids,
  x: number,
  z: number,
  stepM: number,
  target: { x: number; y: number; z: number },
): void {
  const { ox, oz, upper } = facetCell(x, z, stepM);
  const y00 = sampleSmoothWorldY(grids, ox, oz);
  const y10 = sampleSmoothWorldY(grids, ox + stepM, oz);
  const y01 = sampleSmoothWorldY(grids, ox, oz + stepM);
  const y11 = sampleSmoothWorldY(grids, ox + stepM, oz + stepM);
  if (!upper) {
    writeFaceNormal(target, -(y10 - y00), stepM, -(y01 - y00));
    return;
  }
  writeFaceNormal(target, -(y11 - y01), stepM, y10 - y11);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-8, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Interior point of the triangle sharing the closest crease, plus UV-space
 * distance to that crease (axis: tx/ty; hypot scaled by 1/√2 so world width matches).
 */
function creaseNeighbor(
  ox: number,
  oz: number,
  tx: number,
  ty: number,
  upper: boolean,
  stepM: number,
): { edgeDist: number; nx: number; nz: number } {
  if (!upper) {
    const dW = tx;
    const dS = ty;
    const dH = (1 - tx - ty) * INV_SQRT2;
    const edgeDist = Math.min(dW, dS, dH);
    if (dH <= dW && dH <= dS) {
      return { edgeDist, nx: ox + stepM * 0.7, nz: oz + stepM * 0.7 };
    }
    if (dW <= dS) {
      return { edgeDist, nx: ox + stepM * -0.3, nz: oz + stepM * 0.7 };
    }
    return { edgeDist, nx: ox + stepM * 0.7, nz: oz + stepM * -0.3 };
  }
  const dE = 1 - tx;
  const dN = 1 - ty;
  const dH = (tx + ty - 1) * INV_SQRT2;
  const edgeDist = Math.min(dE, dN, dH);
  if (dH <= dE && dH <= dN) {
    return { edgeDist, nx: ox + stepM * 0.25, nz: oz + stepM * 0.25 };
  }
  if (dE <= dN) {
    return { edgeDist, nx: ox + stepM * 1.25, nz: oz + stepM * 0.25 };
  }
  return { edgeDist, nx: ox + stepM * 0.25, nz: oz + stepM * 1.25 };
}

export function sampleChiseledWorldY(grids: MapGrids, x: number, z: number): number {
  return meshGridWorldYAtStep(grids, x, z, terrainFacetStepM());
}

export function sampleChiseledWorldNormal(
  grids: MapGrids,
  x: number,
  z: number,
  target: Vector3,
): Vector3 {
  const stepM = terrainFacetStepM();
  meshGridFaceNormalAtStep(grids, x, z, stepM, _nSelf);
  const edgeSoft = liveChiselEdgeSoft();
  if (edgeSoft <= 1e-4) {
    return target.set(_nSelf.x, _nSelf.y, _nSelf.z);
  }
  const { ox, oz, tx, ty, upper } = facetCell(x, z, stepM);
  const { edgeDist, nx, nz } = creaseNeighbor(ox, oz, tx, ty, upper, stepM);
  meshGridFaceNormalAtStep(grids, nx, nz, stepM, _nNeighbor);
  const filletW = 1 - smoothstep(0, Math.max(edgeSoft, 1e-5), edgeDist);
  const w = filletW * 0.5;
  const mx = _nSelf.x * (1 - w) + _nNeighbor.x * w;
  const my = _nSelf.y * (1 - w) + _nNeighbor.y * w;
  const mz = _nSelf.z * (1 - w) + _nNeighbor.z * w;
  const len = Math.hypot(mx, my, mz) || 1;
  return target.set(mx / len, my / len, mz / len);
}

/** Grid-cell pad so regional shadow/CPU mesh updates cover a whole facet. */
export function chiselDirtyMarginCells(grids: MapGrids): number {
  const cellWorld = WORLD_SIZE / Math.max(1, grids.size - 1);
  return Math.max(2, Math.ceil(terrainFacetStepM() / Math.max(1e-6, cellWorld)) + 1);
}
