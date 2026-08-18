// src/map/authoring/quilezHeightField.ts — Quilez derivative-damped FBM + domain warp (TerrainGenerator port)
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export interface QuilezHeightParams {
  seed: number;
  /** World-space base frequency (mountain footprint ≈ 1/frequency). */
  frequency: number;
  octaves: number;
  lacunarity: number;
  gain: number;
  /** Derivative damping — higher flattens valleys and sharpens ridges. */
  erosion: number;
  /** Domain-warp strength in noise units. */
  warp: number;
  /** Power curve over height; >1 flattens the valley floor. */
  valleyBias: number;
}

const DEFAULTS: QuilezHeightParams = {
  seed: 1,
  frequency: 0.008,
  octaves: 5,
  lacunarity: 1.97,
  gain: 0.5,
  erosion: 0.7,
  warp: 0.35,
  valleyBias: 1.2,
};

/** Deterministic PRNG (mulberry32) — same seed always yields the same field. */
function createRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a world-space height sampler in ~0…1 (after valley bias, before sea/height scale).
 * Port of TerrainGenerator's heightField / eroded / warpField.
 */
export function createQuilezHeightSampler(
  params: Partial<QuilezHeightParams> = {},
): (worldX: number, worldZ: number) => number {
  const p: QuilezHeightParams = { ...DEFAULTS, ...params };
  const perlin = new ImprovedNoise();
  const random = createRandom(p.seed);

  const offsetX = random() * 256;
  const offsetZ = random() * 256;
  const slice = random() * 256;

  const { frequency, octaves, lacunarity, gain, erosion, warp, valleyBias } = p;

  function warpField(x: number, z: number, zr: number): number {
    let freq = 1;
    let amp = 1;
    let sum = 0;
    let norm = 0;

    for (let i = 0; i < 2; i++) {
      sum += amp * perlin.noise(x * freq + offsetX, z * freq + offsetZ, zr + i * 1.7);
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }

    return sum / norm;
  }

  function eroded(x: number, z: number): number {
    let sum = 0;
    let amp = 1;
    let dX = 0;
    let dZ = 0;
    let px = x;
    let pz = z;
    let freq = 1;
    const e = 0.004;

    for (let i = 0; i < octaves; i++) {
      const zr = slice + i * 1.7;
      const bx = px * freq + offsetX;
      const bz = pz * freq + offsetZ;
      const n = perlin.noise(bx, bz, zr);
      const nx = perlin.noise(bx + e, bz, zr);
      const nz = perlin.noise(bx, bz + e, zr);

      dX += ((nx - n) / e) * freq;
      dZ += ((nz - n) / e) * freq;

      sum += (amp * n) / (1 + erosion * (dX * dX + dZ * dZ));

      const rx = 0.8 * px - 0.6 * pz;
      pz = 0.6 * px + 0.8 * pz;
      px = rx;

      freq *= lacunarity;
      amp *= gain;
    }

    return sum * 0.5 + 0.5;
  }

  return (worldX: number, worldZ: number) => {
    const x = worldX * frequency;
    const z = worldZ * frequency;

    const wx = x + warp * warpField(x + 1.3, z + 7.2, slice + 40);
    const wz = z + warp * warpField(x + 5.2, z + 1.3, slice + 70);

    return Math.min(eroded(wx, wz) * 1.1, 1) ** valleyBias;
  };
}
