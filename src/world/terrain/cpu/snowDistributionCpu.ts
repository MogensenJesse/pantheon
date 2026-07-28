// src/world/terrain/cpu/snowDistributionCpu.ts — CPU mirror of GPU snow distribution (editor footing parity)
import { Vector3 } from 'three';
import { sunDirectionFromSpherical } from '../../../rendering/sunSpherical';
import type { TerrainSnowTune } from '../config/terrainBiomeTuning';

const SNOW_NOISE_SEED = 0x536e6f77;

interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ (ix * 374761393 + iy * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(0, 1, x - x0);
  const ty = smoothstep(0, 1, y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

/** FBM ~0..1 — approximate GPU triNoise3D macro variation for footing parity. */
function sampleSnowNoiseFbm(worldX: number, worldZ: number, scale: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += valueNoise(worldX * scale * freq, worldZ * scale * freq, SNOW_NOISE_SEED + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return norm > 0 ? sum / norm : 0;
}

export function bakeSnowReferenceSunDir(snow: TerrainSnowTune, out = new Vector3()): Vector3 {
  return sunDirectionFromSpherical(
    snow.aspect.referenceElevationDeg,
    snow.aspect.referenceAzimuthDeg,
    out,
  );
}

export function computeSnowWeightCpu(
  heightNorm: number,
  hwUsed: Vec4,
  worldX: number,
  worldZ: number,
  normal: Vector3,
  snow: TerrainSnowTune,
  referenceSunDir: Vector3,
): number {
  const snowStartPad = snow.mountainWeight * 0.12;
  const snowEndPad = snow.mountainWeight * 0.08;

  const noise = sampleSnowNoiseFbm(worldX, worldZ, snow.noise.scale);
  const heightEff = heightNorm + (noise - 0.5) * 2 * snow.noise.amplitude;
  const heightSnow = smoothstep(
    snow.heightStart - snowStartPad,
    snow.heightEnd - snowEndPad,
    heightEff,
  );
  let snowW = heightSnow * mix(1, hwUsed.w, snow.mountainWeight);

  const exposure = Math.max(
    0,
    Math.min(
      1,
      normal.x * referenceSunDir.x + normal.y * referenceSunDir.y + normal.z * referenceSunDir.z,
    ),
  );
  const aspectMul = mix(1 + snow.aspect.shadeBoost, 1 - snow.aspect.strength, exposure);
  snowW = Math.max(0, Math.min(1, snowW * aspectMul));

  const slopeMul = smoothstep(snow.slope.normalYEnd, snow.slope.normalYStart, normal.y);
  const slopeFactor = mix(1, slopeMul, snow.slope.strength);
  return snowW * slopeFactor;
}
