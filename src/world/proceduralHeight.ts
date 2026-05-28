// src/world/proceduralHeight.ts — shared procedural height sampling (terrain + editor bake)
import { createNoise2D } from 'simplex-noise';
import alea from 'alea';
import { WORLD } from './WorldConfig';

const noise2D = createNoise2D(alea(WORLD.SEED));

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Peninsula island mask.
 * nx, nz are normalized coordinates in [-0.5, 0.5].
 */
export function islandMask(nx: number, nz: number): number {
  const dist = Math.sqrt(nx * nx + nz * nz);
  const radial = 1 - smoothstep(0.22, 0.48, dist);
  const cornerFactor =
    Math.max(0, Math.min(1, nx * 2)) * Math.max(0, Math.min(1, -nz * 2));
  const peninsulaBoost = smoothstep(0, 0.5, cornerFactor);
  return Math.max(0, Math.min(1, Math.max(radial, peninsulaBoost)));
}

export function sampleHeight(nx: number, nz: number): number {
  let h = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 6; o++) {
    h += noise2D(nx * freq, nz * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return (h + 1) * 0.5;
}

/** Normalized height [0, 1] after island mask. */
export function sampleProceduralHeight(nx: number, nz: number): number {
  return sampleHeight(nx, nz) * islandMask(nx, nz);
}

/** World XZ → normalized height (clamped to island bounds). */
export function sampleProceduralHeightAt(x: number, z: number, size = WORLD.SIZE): number {
  const nx = Math.max(-0.5, Math.min(0.5, x / size));
  const nz = Math.max(-0.5, Math.min(0.5, z / size));
  return sampleProceduralHeight(nx, nz);
}

/** Bake procedural heights with optional seed override (editor "New map"). */
export function bakeProceduralHeightGrid(
  gridSize: number,
  size: number = WORLD.SIZE,
  seed: string = WORLD.SEED,
): Float32Array {
  const noise = createNoise2D(alea(seed));
  const data = new Float32Array(gridSize * gridSize);
  const half = size * 0.5;
  const step = size / (gridSize - 1);

  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const nx = x / size;
      const nz = z / size;
      let h = 0;
      let amp = 0.5;
      let freq = 1;
      for (let o = 0; o < 6; o++) {
        h += noise(nx * freq, nz * freq) * amp;
        freq *= 2;
        amp *= 0.5;
      }
      const norm = (h + 1) * 0.5;
      data[j * gridSize + i] = norm * islandMask(nx, nz);
    }
  }
  return data;
}
