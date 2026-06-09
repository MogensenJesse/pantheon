// src/map/biomeWeightBake.ts — smoothed biome weight bake for terrain + grass
import { VISUAL } from '../config/visualTuning';
import type { MapGrids } from './MapGrids';
import { BiomeId, type BiomeIdValue } from './MapTypes';

export interface BiomeWeightBakeOptions {
  /** Blur radius in grid cells (0 = sharp one-hot weights). */
  blurRadiusCells?: number;
}

export function defaultBiomeBlurRadiusCells(): number {
  return VISUAL.terrain.biomeBlendRadiusCells;
}

export function biomeIdToWeights(id: BiomeIdValue): [number, number, number, number] {
  switch (id) {
    case BiomeId.Water:
      return [0, 0, 0, 0];
    case BiomeId.Shore:
      return [1, 0, 0, 0];
    case BiomeId.Forest:
      return [0, 1, 0, 0];
    case BiomeId.Hills:
      return [0, 0, 1, 0];
    case BiomeId.Mountain:
      return [0, 0, 0, 1];
    case BiomeId.Path:
      return [0.15, 0.55, 0.2, 0.1];
    case BiomeId.Meadow:
      return [0.05, 0.65, 0.15, 0.15];
    default:
      return [0, 1, 0, 0];
  }
}

function resolveBlurRadius(options?: BiomeWeightBakeOptions): number {
  return Math.max(0, Math.round(options?.blurRadiusCells ?? defaultBiomeBlurRadiusCells()));
}

function buildWaterMask(grids: MapGrids): Uint8Array {
  const mask = new Uint8Array(grids.biome.length);
  for (let i = 0; i < grids.biome.length; i++) {
    mask[i] = grids.biome[i] === BiomeId.Water ? 1 : 0;
  }
  return mask;
}

function fillRawWeights(grids: MapGrids, out: Float32Array): void {
  for (let i = 0; i < grids.biome.length; i++) {
    const [wShore, wForest, wHills, wRock] = biomeIdToWeights(grids.biome[i] as BiomeIdValue);
    const o = i * 4;
    out[o] = wShore;
    out[o + 1] = wForest;
    out[o + 2] = wHills;
    out[o + 3] = wRock;
  }
}

function separableBlurChannel(
  src: Float32Array,
  dst: Float32Array,
  scratch: Float32Array,
  size: number,
  channel: number,
  radius: number,
  waterMask: Uint8Array,
): void {
  if (radius <= 0) return;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      if (waterMask[idx]) {
        scratch[idx] = 0;
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const ni = Math.max(0, Math.min(size - 1, i + k));
        const nIdx = j * size + ni;
        if (waterMask[nIdx]) continue;
        sum += src[nIdx * 4 + channel];
        count += 1;
      }
      scratch[idx] = count > 0 ? sum / count : 0;
    }
  }

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      if (waterMask[idx]) {
        dst[idx * 4 + channel] = 0;
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const nj = Math.max(0, Math.min(size - 1, j + k));
        const nIdx = nj * size + i;
        if (waterMask[nIdx]) continue;
        sum += scratch[nIdx];
        count += 1;
      }
      dst[idx * 4 + channel] = count > 0 ? sum / count : 0;
    }
  }
}

function renormalizeLandWeights(weights: Float32Array, size: number, waterMask: Uint8Array): void {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const o = idx * 4;
      if (waterMask[idx]) {
        weights[o] = 0;
        weights[o + 1] = 0;
        weights[o + 2] = 0;
        weights[o + 3] = 0;
        continue;
      }
      const sum = weights[o] + weights[o + 1] + weights[o + 2] + weights[o + 3];
      if (sum > 1e-6) {
        weights[o] /= sum;
        weights[o + 1] /= sum;
        weights[o + 2] /= sum;
        weights[o + 3] /= sum;
      }
    }
  }
}

/** Smoothed shore/forest/hills/rock weights (RGBA interleaved, 0–1). */
export function buildSmoothedBiomeWeights(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): Float32Array {
  const { size } = grids;
  const count = size * size;
  const radius = resolveBlurRadius(options);
  const waterMask = buildWaterMask(grids);
  const weights = new Float32Array(count * 4);
  fillRawWeights(grids, weights);

  if (radius <= 0) {
    renormalizeLandWeights(weights, size, waterMask);
    return weights;
  }

  const scratch = new Float32Array(count);
  const blurred = new Float32Array(count * 4);
  for (let channel = 0; channel < 4; channel++) {
    separableBlurChannel(weights, blurred, scratch, size, channel, radius, waterMask);
    for (let i = 0; i < count; i++) {
      weights[i * 4 + channel] = blurred[i * 4 + channel];
    }
  }

  renormalizeLandWeights(weights, size, waterMask);
  return weights;
}

export function fillBiomeWeightTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  const weights = buildSmoothedBiomeWeights(grids, options);
  for (let i = 0; i < grids.biome.length; i++) {
    const o = i * 4;
    data[o] = Math.round(weights[o] * 255);
    data[o + 1] = Math.round(weights[o + 1] * 255);
    data[o + 2] = Math.round(weights[o + 2] * 255);
    data[o + 3] = Math.round(weights[o + 3] * 255);
  }
}

function separableBlurScalar(
  src: Float32Array,
  dst: Float32Array,
  scratch: Float32Array,
  size: number,
  radius: number,
): void {
  if (radius <= 0) return;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const ni = Math.max(0, Math.min(size - 1, i + k));
        sum += src[j * size + ni];
        count += 1;
      }
      scratch[idx] = sum / count;
    }
  }

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const nj = Math.max(0, Math.min(size - 1, j + k));
        sum += scratch[nj * size + i];
        count += 1;
      }
      dst[idx] = sum / count;
    }
  }
}

export function buildBlurredPathMask(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): Float32Array {
  const { size } = grids;
  const count = size * size;
  const radius = resolveBlurRadius(options);
  const raw = new Float32Array(count);

  for (let i = 0; i < grids.biome.length; i++) {
    raw[i] = grids.biome[i] === BiomeId.Path ? 1 : 0;
  }

  if (radius <= 0) return raw;

  const scratch = new Float32Array(count);
  const blurred = new Float32Array(count);
  separableBlurScalar(raw, blurred, scratch, size, radius);
  return blurred;
}

export function buildBlurredMeadowMask(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): Float32Array {
  const { size } = grids;
  const count = size * size;
  const radius = resolveBlurRadius(options);
  const raw = new Float32Array(count);

  for (let i = 0; i < grids.biome.length; i++) {
    raw[i] = grids.biome[i] === BiomeId.Meadow ? 1 : 0;
  }

  if (radius <= 0) return raw;

  const scratch = new Float32Array(count);
  const blurred = new Float32Array(count);
  separableBlurScalar(raw, blurred, scratch, size, radius);
  return blurred;
}

/** @deprecated Use buildPathGrassMultiplier for partial path grass. */
export function buildPathOffMask(grids: MapGrids, options?: BiomeWeightBakeOptions): Float32Array {
  const pathMask = buildBlurredPathMask(grids, options);
  const offMask = new Float32Array(pathMask.length);
  for (let i = 0; i < pathMask.length; i++) {
    offMask[i] = 1 - pathMask[i];
  }
  return offMask;
}

/** Per-cell grass multiplier from path mask: pathDensity at center → 1 off-path. */
export function buildPathGrassMultiplier(
  grids: MapGrids,
  pathDensity: number,
  options?: BiomeWeightBakeOptions,
): Float32Array {
  const pathMask = buildBlurredPathMask(grids, options);
  const mul = new Float32Array(pathMask.length);
  for (let i = 0; i < pathMask.length; i++) {
    mul[i] = pathDensity + (1 - pathDensity) * (1 - pathMask[i]);
  }
  return mul;
}

export function fillMeadowMaskTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  const blurred = buildBlurredMeadowMask(grids, options);
  for (let i = 0; i < blurred.length; i++) {
    data[i] = Math.round(Math.max(0, Math.min(1, blurred[i])) * 255);
  }
}

export function fillPathMaskTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  const blurred = buildBlurredPathMask(grids, options);
  for (let i = 0; i < blurred.length; i++) {
    data[i] = Math.round(Math.max(0, Math.min(1, blurred[i])) * 255);
  }
}
