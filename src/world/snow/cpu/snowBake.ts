// src/world/snow/cpu/snowBake.ts — the static snow, baked once at load: hull height, snow depth and hull slope per texel
//
// CPU twin of the terrain splat's snow line (`computeSnowWeight` x `1 - slopeRockDerived`), except that the splat
// reads the mountain biome weight per facet and this does not (it scales the line by at most `mountainWeight`, 10%).
// The hull is the chisel (walkable Y, AGENTS height rule) smoothed over about 8 m, plus `thicknessM x weight`:
// soft drifts in hollows, bare chisel poking through on sharp convex ridges (depth 0 there, the shell drops out).
// Pure: samplers come in as functions, so the node checks can bake a synthetic mountain.
import { triNoise3D } from './snowNoise.ts';

/** The terrain's snow tuning (`VISUAL.terrain.snow`); only the fields the bake reads. */
export interface SnowBakeTune {
  heightStart: number;
  heightEnd: number;
  mountainWeight: number;
  noise: { amplitude: number; scale: number };
  aspect: { strength: number; shadeBoost: number };
}

export interface SnowBakeSource {
  /** Texels per side and metres per texel; texel (i, j) is centred at `(i + 0.5) * texelM - size * texelM / 2`. */
  size: number;
  texelM: number;
  /** Walkable chisel Y (m) at a world XZ. */
  chiselY: (x: number, z: number) => number;
  /** 0-1 steep-face weight from a face normal's Y (`slopeRockDerivedFromNormalY`). */
  slopeRock: (ny: number) => number;
  /** Metres per unit of normalised height. */
  heightScale: number;
  tune: SnowBakeTune;
  /** Unit vector towards the aspect reference sun. */
  sunDir: readonly [number, number, number];
  /** Snow depth (m) where the weight is 1. */
  thicknessM: number;
}

export interface SnowBake {
  size: number;
  texelM: number;
  /** Hull Y (m); equals the chisel where there is no snow, can sit below it on sharp ridges. */
  hull: Float32Array;
  /** Snow above the chisel (m), 0 where bare. */
  depth: Float32Array;
  /** dY/dx, dY/dz of the hull, two floats per texel (0 where bare). */
  slope: Float32Array;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The splat's snow weight before the steep-face cancel: height line with noise, then the sun-aspect factor. */
export function snowWeight(
  tune: SnowBakeTune,
  heightNorm: number,
  wx: number,
  wz: number,
  normal: readonly [number, number, number],
  sunDir: readonly [number, number, number],
): number {
  const { heightStart, heightEnd, mountainWeight, noise, aspect } = tune;
  const startPad = mountainWeight * 0.12;
  if (heightNorm + noise.amplitude < heightStart - startPad) return 0;
  const n = triNoise3D(wx * noise.scale, 0, wz * noise.scale);
  const heightEff = heightNorm + (n - 0.5) * 2 * noise.amplitude;
  const line = smoothstep(heightStart - startPad, heightEnd - mountainWeight * 0.08, heightEff);
  const exposure = Math.min(
    1,
    Math.max(0, normal[0] * sunDir[0] + normal[1] * sunDir[1] + normal[2] * sunDir[2]),
  );
  const aspectMul = (1 + aspect.shadeBoost) * (1 - exposure) + (1 - aspect.strength) * exposure;
  return Math.min(1, Math.max(0, line * aspectMul));
}

/** Separable [1 2 3 2 1] / 9 blur with clamped edges (about 4 m at 2 m texels). */
function blurTriangle(src: Float32Array, size: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = [1, 2, 3, 2, 1];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let s = 0;
      for (let d = -2; d <= 2; d++) {
        s += src[j * size + Math.min(size - 1, Math.max(0, i + d))] * k[d + 2];
      }
      tmp[j * size + i] = s / 9;
    }
  }
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let s = 0;
      for (let d = -2; d <= 2; d++) {
        s += tmp[Math.min(size - 1, Math.max(0, j + d)) * size + i] * k[d + 2];
      }
      out[j * size + i] = s / 9;
    }
  }
  return out;
}

export function bakeSnow(src: SnowBakeSource): SnowBake {
  const { size, texelM, tune } = src;
  const n = size * size;
  const half = (size * texelM) / 2;
  const chisel = new Float32Array(n);
  for (let j = 0; j < size; j++) {
    const z = (j + 0.5) * texelM - half;
    for (let i = 0; i < size; i++) chisel[j * size + i] = src.chiselY((i + 0.5) * texelM - half, z);
  }
  const smooth = blurTriangle(chisel, size);

  const hull = new Float32Array(n);
  const depth = new Float32Array(n);
  const floor = tune.heightStart - tune.mountainWeight * 0.12;
  for (let j = 0; j < size; j++) {
    const jl = Math.max(0, j - 1);
    const jr = Math.min(size - 1, j + 1);
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const y = chisel[k];
      hull[k] = y;
      if (y / src.heightScale + tune.noise.amplitude < floor) continue;
      const il = Math.max(0, i - 1);
      const ir = Math.min(size - 1, i + 1);
      const sx = (chisel[j * size + ir] - chisel[j * size + il]) / ((ir - il) * texelM);
      const sz = (chisel[jr * size + i] - chisel[jl * size + i]) / ((jr - jl) * texelM);
      const len = Math.hypot(sx, 1, sz);
      const w =
        snowWeight(
          tune,
          y / src.heightScale,
          (i + 0.5) * texelM - half,
          (j + 0.5) * texelM - half,
          [-sx / len, 1 / len, -sz / len],
          src.sunDir,
        ) *
        (1 - src.slopeRock(1 / len));
      if (w <= 0) continue;
      // follow the smoothed ground only as far as there is snow: a continuous edge at the snow line
      const rise = smoothstep(0, 0.25, w) * (smooth[k] - y) + src.thicknessM * w;
      hull[k] = y + rise;
      depth[k] = rise > 0 ? rise : 0;
    }
  }

  const slope = new Float32Array(2 * n);
  for (let j = 0; j < size; j++) {
    const jl = Math.max(0, j - 1);
    const jr = Math.min(size - 1, j + 1);
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      if (depth[k] <= 0) continue;
      const il = Math.max(0, i - 1);
      const ir = Math.min(size - 1, i + 1);
      slope[2 * k] = (hull[j * size + ir] - hull[j * size + il]) / ((ir - il) * texelM);
      slope[2 * k + 1] = (hull[jr * size + i] - hull[jl * size + i]) / ((jr - jl) * texelM);
    }
  }
  return { size, texelM, hull, depth, slope };
}
