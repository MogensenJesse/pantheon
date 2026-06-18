// src/map/ridgeNoise.ts — world-space ridged multifractal for height-grid mountain detail

export interface RidgeNoiseParams {
  /** World-space scale; sample at worldX * frequency. */
  frequency: number;
  octaves: number;
  lacunarity: number;
  gain: number;
  seed?: number;
}

const DEFAULT_SEED = 0x72696467; // 'ridg'

function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ (ix * 374761393 + iy * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

/** Ridged multifractal in ~0…1; ridges peak near 1, valleys near 0. */
export function sampleRidgeNoise(worldX: number, worldZ: number, params: RidgeNoiseParams): number {
  const seed = params.seed ?? DEFAULT_SEED;
  let amplitude = 1;
  let frequency = params.frequency;
  let sum = 0;
  let weight = 1;

  for (let o = 0; o < params.octaves; o++) {
    const n = valueNoise(worldX * frequency, worldZ * frequency, seed + o * 97);
    const signal = 1 - Math.abs(n * 2 - 1);
    sum += signal * signal * amplitude * weight;
    weight = Math.min(1, Math.max(0, signal * 2));
    amplitude *= params.gain;
    frequency *= params.lacunarity;
  }

  const maxOctaves = Math.max(1, params.octaves);
  return Math.max(0, Math.min(1, sum / maxOctaves));
}
