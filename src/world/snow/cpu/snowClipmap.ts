// src/world/snow/cpu/snowClipmap.ts — the shell's snapped clipmap as plain arrays (the mesh wraps them in a BufferGeometry)
//
// Level l is a square ring of `cells` x `cells` cells of size `cellM * 2^l` with a hole in the middle that the finer level
// covers. Every vertex carries its level's cell size (`aCell`): the vertex shader adds the camera position snapped to that
// size, so each level's lattice is fixed in the world and nothing swims. The levels snap independently, so a hole edge can
// sit up to 0.75 cell off the finer level's edge; the hole is one cell smaller than the finer level's extent to cover that,
// and the thin overlap draws the same surface twice. Pure: no imports.

export interface ClipmapSpec {
  /** Levels, finest first. */
  levels: number;
  /** Cells per side of every level (multiple of 4). */
  cells: number;
  /** Cell size (m) of the finest level; each level doubles it. */
  cellM: number;
}

export interface ClipmapArrays {
  /** Local XZ lattice per vertex as (x, 0, z). */
  positions: Float32Array;
  /** Cell size (m) of the vertex's level. */
  cell: Float32Array;
  indices: Uint16Array | Uint32Array;
  triangles: number;
}

/** Half of the hole, in cells of the level itself. */
export const clipmapHoleHalf = (cells: number): number => cells / 4 - 1;

const levelCell = (spec: ClipmapSpec, level: number): number => spec.cellM * 2 ** level;

export function buildClipmapArrays(spec: ClipmapSpec): ClipmapArrays {
  const { levels, cells } = spec;
  const side = cells + 1;
  const vertsPerLevel = side * side;
  const positions = new Float32Array(levels * vertsPerLevel * 3);
  const cell = new Float32Array(levels * vertsPerLevel);
  const index: number[] = [];
  const hole = clipmapHoleHalf(cells);
  for (let l = 0; l < levels; l++) {
    const c = levelCell(spec, l);
    const base = l * vertsPerLevel;
    for (let b = 0; b <= cells; b++) {
      for (let a = 0; a <= cells; a++) {
        const v = base + b * side + a;
        positions[3 * v] = (a - cells / 2) * c;
        positions[3 * v + 2] = (b - cells / 2) * c;
        cell[v] = c;
      }
    }
    for (let b = 0; b < cells; b++) {
      for (let a = 0; a < cells; a++) {
        if (l > 0 && Math.abs(a + 0.5 - cells / 2) < hole && Math.abs(b + 0.5 - cells / 2) < hole) {
          continue;
        }
        const v00 = base + b * side + a;
        const v10 = v00 + 1;
        const v01 = v00 + side;
        const v11 = v01 + 1;
        index.push(v00, v01, v10, v10, v01, v11);
      }
    }
  }
  const indices = positions.length / 3 > 65535 ? new Uint32Array(index) : new Uint16Array(index);
  return { positions, cell, indices, triangles: index.length / 3 };
}

/** Half extent (m) of the coarsest level: past this the clipmap draws nothing. */
export const clipmapExtentM = (spec: ClipmapSpec): number =>
  (spec.cells / 2) * levelCell(spec, spec.levels - 1);

/** Whether some level draws world point (px, pz) when the clipmap follows (camX, camZ); the shader's snapping, replayed. */
export function clipmapCovers(
  spec: ClipmapSpec,
  camX: number,
  camZ: number,
  px: number,
  pz: number,
): boolean {
  const hole = clipmapHoleHalf(spec.cells);
  for (let l = 0; l < spec.levels; l++) {
    const c = levelCell(spec, l);
    const sx = Math.floor(camX / c + 0.5) * c;
    const sz = Math.floor(camZ / c + 0.5) * c;
    const a = Math.floor((px - sx) / c) + spec.cells / 2;
    const b = Math.floor((pz - sz) / c) + spec.cells / 2;
    if (a < 0 || b < 0 || a >= spec.cells || b >= spec.cells) continue;
    if (
      l > 0 &&
      Math.abs(a + 0.5 - spec.cells / 2) < hole &&
      Math.abs(b + 0.5 - spec.cells / 2) < hole
    ) {
      continue;
    }
    return true;
  }
  return false;
}
