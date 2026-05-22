// src/world/grass/grassPlacement.ts — cell jitter on density grid
import { PHASE0 } from '../../config/phase0';
import { WORLD } from '../WorldConfig';

const { GRASS: G } = PHASE0;

export const GRASS_CELL_SIZE = WORLD.SIZE / G.GRID_RES;
export const GRASS_WORLD_MIN = -WORLD.SIZE * 0.5;

/** Deterministic hash in [0, 1). */
export function cellHash(i: number, j: number, k = 0): number {
  const n = Math.sin(i * 12.9898 + j * 78.233 + k * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

export function cellWorldBounds(
  i: number,
  j: number,
): { xMin: number; xMax: number; zMin: number; zMax: number } {
  const xMin = GRASS_WORLD_MIN + i * GRASS_CELL_SIZE;
  const zMin = GRASS_WORLD_MIN + j * GRASS_CELL_SIZE;
  return {
    xMin,
    xMax: xMin + GRASS_CELL_SIZE,
    zMin,
    zMax: zMin + GRASS_CELL_SIZE,
  };
}

const GOLDEN = 0.6180339887;

/** Stratified XZ inside cell — golden-angle disk offsets break visible grid rows. */
export function jitterInCell(i: number, j: number, k: number): { x: number; z: number } {
  const { xMin, xMax, zMin, zMax } = cellWorldBounds(i, j);
  const brickX = (j & 1) === 1 ? GRASS_CELL_SIZE * 0.5 : 0;
  const cx = (xMin + xMax) * 0.5 + brickX;
  const cz = (zMin + zMax) * 0.5;
  const h1 = cellHash(i, j, k);
  const h2 = cellHash(i, j, k + 31);
  const h3 = cellHash(i, j, k + 67);
  const angle = ((i * 17 + j * 31 + k * 13) % 997) * GOLDEN * Math.PI * 2;
  const r = Math.sqrt(h1) * GRASS_CELL_SIZE * 0.42;
  const jitter = GRASS_CELL_SIZE * 0.12;
  return {
    x: cx + Math.cos(angle) * r + (h2 - 0.5) * jitter,
    z: cz + Math.sin(angle) * r + (h3 - 0.5) * jitter,
  };
}

export function bladeCountForCellAt(
  i: number,
  j: number,
  density: number,
  maxBlades: number,
): number {
  if (density < G.DENSITY_THRESHOLD) return 0;
  const frac = cellHash(i, j, 99) * 0.99;
  return Math.floor(density * maxBlades + frac);
}
