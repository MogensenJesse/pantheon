// src/rendering/clouds/cloudWeatherMap.ts — tileable CPU FBM weather map for cloud banks
import type { CloudLayerId, CloudSettings, WeatherSettings } from './cloudConfig';

const MAP_RES = 128;

export interface WeatherSample {
  /** 0–1 soft density after coverage threshold. */
  density: number;
  /** 0–1 low-frequency altitude field (shared flat base within a bank). */
  baseAltitude: number;
}

export interface CloudWeatherMap {
  readonly resolution: number;
  readonly spread: number;
  /** Sample baked low/high coverage + base altitude at world XZ (t = 0). */
  sampleBaked(layer: CloudLayerId, x: number, z: number): WeatherSample;
  /**
   * Live density with two drifting octaves (for later lifecycle evolution).
   * `coverage` is the 0–1 threshold; `t` is elapsed seconds.
   */
  sampleWeather(layer: CloudLayerId, x: number, z: number, coverage: number, t: number): number;
}

function saturate(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fadeHermite(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic 0–1 hash for integer lattice (period wraps via mod). */
function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ (ix * 374761393 + iy * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function wrapIndex(i: number, period: number): number {
  const p = Math.max(1, period | 0);
  return ((i % p) + p) % p;
}

/** Tileable value noise; lattice period matches `period` cells across the domain. */
function valueNoiseTileable(u: number, v: number, period: number, seed: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const tx = fadeHermite(u - x0);
  const ty = fadeHermite(v - y0);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const n00 = hash2(wrapIndex(x0, period), wrapIndex(y0, period), seed);
  const n10 = hash2(wrapIndex(x1, period), wrapIndex(y0, period), seed);
  const n01 = hash2(wrapIndex(x0, period), wrapIndex(y1, period), seed);
  const n11 = hash2(wrapIndex(x1, period), wrapIndex(y1, period), seed);
  const nx0 = lerp(n00, n10, tx);
  const nx1 = lerp(n01, n11, tx);
  return lerp(nx0, nx1, ty);
}

/** Tileable FBM; `basePeriod` = cells across domain at octave 0. */
function fbmTileable(
  u: number,
  v: number,
  basePeriod: number,
  octaves: number,
  seed: number,
): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let freq = 1;
  const oct = Math.max(1, Math.min(8, octaves | 0));
  for (let i = 0; i < oct; i++) {
    const period = Math.max(1, Math.round(basePeriod * freq));
    sum += amp * valueNoiseTileable(u * freq, v * freq, period, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Light Worley (cellular) gaps — tileable over `period` cells.
 * Returns 0–1 distance to nearest feature (mixed into low coverage for holes).
 */
function worleyTileable(u: number, v: number, period: number, seed: number): number {
  const cellX = Math.floor(u);
  const cellY = Math.floor(v);
  let minD = 1e9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = cellX + ox;
      const cy = cellY + oy;
      const wx = wrapIndex(cx, period);
      const wy = wrapIndex(cy, period);
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 19);
      const dx = px - u;
      const dy = py - v;
      const d = dx * dx + dy * dy;
      if (d < minD) minD = d;
    }
  }
  return saturate(Math.sqrt(minD));
}

function densityFromNoise(n: number, coverage: number, softness: number): number {
  const soft = Math.max(1e-4, softness);
  return saturate((n - (1 - coverage)) / soft);
}

function worldToUV(x: number, z: number, spread: number): { u: number; v: number } {
  const s = Math.max(1, spread);
  const u = (((x / s) % 1) + 1) % 1;
  const v = (((z / s) % 1) + 1) % 1;
  return { u, v };
}

function sampleBilinear(grid: Float32Array, res: number, u: number, v: number): number {
  const x = u * res;
  const y = v * res;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const x1 = (x0 + 1) % res;
  const y1 = (y0 + 1) % res;
  const i00 = wrapIndex(y0, res) * res + wrapIndex(x0, res);
  const i10 = wrapIndex(y0, res) * res + x1;
  const i01 = wrapIndex(y1, res) * res + wrapIndex(x0, res);
  const i11 = wrapIndex(y1, res) * res + x1;
  const n00 = grid[i00]!;
  const n10 = grid[i10]!;
  const n01 = grid[i01]!;
  const n11 = grid[i11]!;
  return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), ty);
}

export interface BuildCloudWeatherMapOptions {
  seed: number;
  spread: number;
  weather: WeatherSettings;
  resolution?: number;
}

/**
 * Build ~128² tileable weather fields (period = spread).
 * lowCoverage = FBM + light Worley gaps; highCoverage = separate seed, lower freq;
 * baseAltitude = very low frequency.
 */
export function buildCloudWeatherMap(options: BuildCloudWeatherMapOptions): CloudWeatherMap {
  const res = options.resolution ?? MAP_RES;
  const spread = Math.max(1, options.spread);
  const seed = options.seed;
  const octaves = options.weather.octaves;
  const softness = options.weather.softness;
  const cellM = Math.max(1, options.weather.cellM);
  const basePeriod = Math.max(2, Math.round(spread / cellM));
  const highPeriod = Math.max(2, Math.round(basePeriod * 0.55));
  const altPeriod = Math.max(2, Math.round(basePeriod * 0.25));

  const lowCoverage = new Float32Array(res * res);
  const highCoverage = new Float32Array(res * res);
  const baseAltitude = new Float32Array(res * res);

  for (let iy = 0; iy < res; iy++) {
    for (let ix = 0; ix < res; ix++) {
      const u01 = (ix + 0.5) / res;
      const v01 = (iy + 0.5) / res;
      const uLow = u01 * basePeriod;
      const vLow = v01 * basePeriod;
      const fbmLow = fbmTileable(uLow, vLow, basePeriod, octaves, seed + 11);
      const gaps = worleyTileable(
        uLow * 0.85,
        vLow * 0.85,
        Math.max(2, Math.round(basePeriod * 0.85)),
        seed + 77,
      );
      const low = saturate(fbmLow * 0.82 + gaps * 0.18);
      const uHigh = u01 * highPeriod;
      const vHigh = v01 * highPeriod;
      const high = fbmTileable(uHigh, vHigh, highPeriod, Math.max(1, octaves - 1), seed + 911);
      const uAlt = u01 * altPeriod;
      const vAlt = v01 * altPeriod;
      const alt = fbmTileable(uAlt, vAlt, altPeriod, 2, seed + 1709);
      const idx = iy * res + ix;
      lowCoverage[idx] = low;
      highCoverage[idx] = high;
      baseAltitude[idx] = alt;
    }
  }

  const gridFor = (layer: CloudLayerId): Float32Array =>
    layer === 'low' ? lowCoverage : highCoverage;

  return {
    resolution: res,
    spread,
    sampleBaked(layer, x, z) {
      const { u, v } = worldToUV(x, z, spread);
      const n = sampleBilinear(gridFor(layer), res, u, v);
      const alt = sampleBilinear(baseAltitude, res, u, v);
      return { density: n, baseAltitude: alt };
    },
    sampleWeather(layer, x, z, coverage, t) {
      const { u, v } = worldToUV(x, z, spread);
      const period = layer === 'low' ? basePeriod : highPeriod;
      const layerSeed = layer === 'low' ? seed + 11 : seed + 911;
      const evolve = options.weather.evolveSpeed;
      const driftA = t * evolve;
      const driftB = t * evolve * 0.37;
      const uA = u * period + driftA * period;
      const vA = v * period + driftA * period * 0.7;
      const uB = u * period * 2 + driftB * period * 2;
      const vB = v * period * 2 - driftB * period * 1.3;
      const n0 = valueNoiseTileable(uA, vA, period, layerSeed);
      const n1 = valueNoiseTileable(uB, vB, Math.max(1, period * 2), layerSeed + 3);
      let n = n0 * 0.65 + n1 * 0.35;
      if (layer === 'low') {
        const gaps = worleyTileable(
          u * period * 0.85 + driftA,
          v * period * 0.85 - driftA * 0.5,
          Math.max(2, Math.round(period * 0.85)),
          seed + 77,
        );
        n = saturate(n * 0.82 + gaps * 0.18);
      }
      return densityFromNoise(n, coverage, softness);
    },
  };
}

/** Density from a baked raw noise sample + coverage threshold. */
export function weatherDensityFromRaw(
  raw: number,
  coverage: number,
  weather: WeatherSettings,
): number {
  return densityFromNoise(raw, coverage, weather.softness);
}

/** Convenience: build from full CloudSettings. */
export function buildCloudWeatherMapFromSettings(settings: CloudSettings): CloudWeatherMap {
  return buildCloudWeatherMap({
    seed: settings.seed,
    spread: settings.spread,
    weather: settings.weather,
  });
}
