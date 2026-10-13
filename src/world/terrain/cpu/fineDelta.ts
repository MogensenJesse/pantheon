// src/world/terrain/cpu/fineDelta.ts — 2 m height offsets laid over the 8 m chisel facets inside one region
//
// The play terrain is 8 m facets (terrainChiselCpu.ts), too coarse to hold a house-sized pad. A
// FineDelta stores an offset per node of a 4x finer lattice. Each 2 m triangle lies inside one 8 m
// triangle (same diagonal), so coarse Y + the offset interpolated on the 2 m triangle is the levelled
// surface, and offsets of zero reproduce the 8 m chisel exactly. The original heights are never edited.
// Pure data and math (no three), so the village sim scripts can run it in node.

/** Fine lattice cells per coarse facet cell along one axis. */
export const FINE_DIVISOR = 4;

export interface FineDelta {
  /** Fine lattice step (m). */
  readonly stepM: number;
  /** World XZ of node (0, 0); a multiple of the coarse step so the lattices nest. */
  readonly originX: number;
  readonly originZ: number;
  /** Nodes per side (cells + 1). */
  readonly nodes: number;
  /** Offset (m) added to the coarse chisel Y at each node, row-major in z then x. */
  readonly data: Float32Array;
  /** Bumped on every write; consumers re-upload when it changes. */
  version: number;
}

/**
 * A square of `halfM` around (cx, cz), snapped outward to whole coarse cells. Its border stays at
 * zero offset, so it joins the coarse mesh without a crack.
 */
export function createFineDelta(
  cx: number,
  cz: number,
  halfM: number,
  coarseStepM: number,
): FineDelta {
  const stepM = coarseStepM / FINE_DIVISOR;
  const cells = Math.ceil(halfM / coarseStepM) * 2;
  const originX = Math.floor(cx / coarseStepM) * coarseStepM - (cells / 2) * coarseStepM;
  const originZ = Math.floor(cz / coarseStepM) * coarseStepM - (cells / 2) * coarseStepM;
  const nodes = cells * FINE_DIVISOR + 1;
  return { stepM, originX, originZ, nodes, data: new Float32Array(nodes * nodes), version: 0 };
}

/** Node-index bounds (inclusive) of a rectangle of nodes. */
export interface NodeBounds {
  ix0: number;
  iz0: number;
  ix1: number;
  iz1: number;
}

/** Side length (m) of the region. */
export function fineDeltaSizeM(fd: FineDelta): number {
  return (fd.nodes - 1) * fd.stepM;
}

export function fineDeltaContains(fd: FineDelta, x: number, z: number): boolean {
  const size = fineDeltaSizeM(fd);
  return x >= fd.originX && x < fd.originX + size && z >= fd.originZ && z < fd.originZ + size;
}

interface Triangle {
  /** Node index of the three corners and their barycentric weights. */
  a: number;
  b: number;
  c: number;
  wa: number;
  wb: number;
  wc: number;
}

const _tri: Triangle = { a: 0, b: 0, c: 0, wa: 0, wb: 0, wc: 0 };

/**
 * The fine triangle under (x, z): lower (00, +Z, +X) when tx + tz < 1, else upper (+Z, +X+Z, +X),
 * matching the coarse mesh diagonal. Returns false outside the region.
 */
function locate(fd: FineDelta, x: number, z: number): boolean {
  if (!fineDeltaContains(fd, x, z)) return false;
  const fx = (x - fd.originX) / fd.stepM;
  const fz = (z - fd.originZ) / fd.stepM;
  const ix = Math.min(fd.nodes - 2, Math.floor(fx));
  const iz = Math.min(fd.nodes - 2, Math.floor(fz));
  const tx = fx - ix;
  const tz = fz - iz;
  const n = fd.nodes;
  const i00 = iz * n + ix;
  const i10 = i00 + 1;
  const i01 = i00 + n;
  const i11 = i01 + 1;
  if (tx + tz < 1) {
    _tri.a = i00;
    _tri.b = i01;
    _tri.c = i10;
    _tri.wa = 1 - tx - tz;
    _tri.wb = tz;
    _tri.wc = tx;
  } else {
    _tri.a = i01;
    _tri.b = i11;
    _tri.c = i10;
    _tri.wa = 1 - tx;
    _tri.wb = tx + tz - 1;
    _tri.wc = 1 - tz;
  }
  return true;
}

/** Offset (m) at a world point; 0 outside the region. */
export function sampleFineDelta(fd: FineDelta, x: number, z: number): number {
  if (!locate(fd, x, z)) return 0;
  const d = fd.data;
  return d[_tri.a]! * _tri.wa + d[_tri.b]! * _tri.wb + d[_tri.c]! * _tri.wc;
}

/**
 * Slope of the offset on the fine triangle under (x, z): `out.x` = d(offset)/dx, `out.z` = d/dz.
 * Zero outside the region and wherever the three corners agree.
 */
export function sampleFineDeltaSlope(
  fd: FineDelta,
  x: number,
  z: number,
  out: { x: number; z: number },
): void {
  out.x = 0;
  out.z = 0;
  if (!locate(fd, x, z)) return;
  const d = fd.data;
  const n = fd.nodes;
  const ya = d[_tri.a]!;
  const yb = d[_tri.b]!;
  const yc = d[_tri.c]!;
  // Lower: a = 00, b = +Z (01), c = +X (10). Upper: a = +Z (01), b = +X+Z (11), c = +X (10).
  if (_tri.b === _tri.a + n) {
    out.x = (yc - ya) / fd.stepM;
    out.z = (yb - ya) / fd.stepM;
  } else {
    out.x = (yb - ya) / fd.stepM;
    out.z = (yb - yc) / fd.stepM;
  }
}

/** World XZ of a node. */
export function fineNodeWorld(
  fd: FineDelta,
  ix: number,
  iz: number,
  out: { x: number; z: number },
) {
  out.x = fd.originX + ix * fd.stepM;
  out.z = fd.originZ + iz * fd.stepM;
}
