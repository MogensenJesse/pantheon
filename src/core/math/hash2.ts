// src/core/math/hash2.ts — deterministic integer-lattice hash

/** Deterministic 0–1 hash for integer lattice (period wraps via mod). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ (ix * 374761393 + iy * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
