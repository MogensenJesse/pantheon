// src/world/terrain/fineTerrainGeometry.ts — the detail patch's triangles: coarse chisel Y + levelling offsets, flat per face
import { BufferAttribute, BufferGeometry } from 'three';
import type { MapGrids } from '../../map/MapGrids';
import type { FineDelta, NodeBounds } from './cpu/fineDelta';
import { sampleChiseledWorldYBase } from './cpu/terrainChiselCpu';

export interface FineGeometry {
  geometry: BufferGeometry;
  /** Coarse (8 m chisel) Y at every node: what the region was before any levelling. */
  baseNodeY: Float32Array;
  /** Rebake the cells around changed nodes (all when omitted). */
  bake: (bounds?: NodeBounds) => void;
}

export function createFineGeometry(delta: FineDelta, grids: MapGrids): FineGeometry {
  const n = delta.nodes;
  const cells = n - 1;
  const s = delta.stepM;

  const baseNodeY = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      baseNodeY[iz * n + ix] = sampleChiseledWorldYBase(
        grids,
        delta.originX + ix * s,
        delta.originZ + iz * s,
      );
    }
  }

  // Six vertices per cell, flat: per-face normal and per-face offset slope, no index.
  const position = new Float32Array(cells * cells * 6 * 3);
  const normal = new Float32Array(cells * cells * 6 * 3);
  const slope = new Float32Array(cells * cells * 6 * 2);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('aDeltaSlope', new BufferAttribute(slope, 2));

  const d = delta.data;
  const writeTriangle = (
    v: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    slopeX: number,
    slopeZ: number,
  ) => {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const wx = cx - ax;
    const wy = cy - ay;
    const wz = cz - az;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const corners = [ax, ay, az, bx, by, bz, cx, cy, cz];
    for (let k = 0; k < 3; k++) {
      const o = (v + k) * 3;
      position[o] = corners[k * 3]!;
      position[o + 1] = corners[k * 3 + 1]!;
      position[o + 2] = corners[k * 3 + 2]!;
      normal[o] = nx;
      normal[o + 1] = ny;
      normal[o + 2] = nz;
      slope[(v + k) * 2] = slopeX;
      slope[(v + k) * 2 + 1] = slopeZ;
    }
  };

  /** Lower triangle (00, +Z, +X), upper (+Z, +X+Z, +X): the diagonal the coarse mesh and the CPU use. */
  const bakeCell = (cx: number, cz: number) => {
    const i00 = cz * n + cx;
    const i10 = i00 + 1;
    const i01 = i00 + n;
    const i11 = i01 + 1;
    const x0 = delta.originX + cx * s;
    const z0 = delta.originZ + cz * s;
    const x1 = x0 + s;
    const z1 = z0 + s;
    const y00 = baseNodeY[i00]! + d[i00]!;
    const y10 = baseNodeY[i10]! + d[i10]!;
    const y01 = baseNodeY[i01]! + d[i01]!;
    const y11 = baseNodeY[i11]! + d[i11]!;
    const v = (cz * cells + cx) * 6;
    writeTriangle(
      v,
      x0,
      y00,
      z0,
      x0,
      y01,
      z1,
      x1,
      y10,
      z0,
      (d[i10]! - d[i00]!) / s,
      (d[i01]! - d[i00]!) / s,
    );
    writeTriangle(
      v + 3,
      x0,
      y01,
      z1,
      x1,
      y11,
      z1,
      x1,
      y10,
      z0,
      (d[i11]! - d[i01]!) / s,
      (d[i11]! - d[i10]!) / s,
    );
  };

  const bake = (bounds?: NodeBounds) => {
    const cx0 = Math.max(0, (bounds?.ix0 ?? 0) - 1);
    const cz0 = Math.max(0, (bounds?.iz0 ?? 0) - 1);
    const cx1 = Math.min(cells - 1, bounds?.ix1 ?? cells - 1);
    const cz1 = Math.min(cells - 1, bounds?.iz1 ?? cells - 1);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) bakeCell(cx, cz);
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('normal').needsUpdate = true;
    geometry.getAttribute('aDeltaSlope').needsUpdate = true;
  };
  bake();
  return { geometry, baseNodeY, bake };
}
