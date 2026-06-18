// src/map/biomeWeightBake.ts — smoothed biome weight bake for terrain + grass
import { VISUAL } from '../config/visualTuning';
import type { GridDirtyRegion } from './gridDirtyRegion';
import { expandDirtyRegion } from './gridDirtyRegion';
import type { MapGrids } from './MapGrids';
import { BiomeId, type BiomeIdValue } from './MapTypes';

export interface BiomeWeightBakeOptions {
  /** Blur radius in grid cells (0 = sharp one-hot weights). */
  blurRadiusCells?: number;
  /** When set, only rebake this painted region (+ blur margin). */
  region?: GridDirtyRegion;
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

function isWaterCell(grids: MapGrids, idx: number): boolean {
  return grids.biome[idx] === BiomeId.Water;
}

function rawWeightChannel(grids: MapGrids, i: number, j: number, channel: number, size: number): number {
  const idx = j * size + i;
  if (isWaterCell(grids, idx)) return 0;
  return biomeIdToWeights(grids.biome[idx] as BiomeIdValue)[channel]!;
}

function horizontalBlurWeightChannel(
  grids: MapGrids,
  i: number,
  j: number,
  channel: number,
  radius: number,
  size: number,
): number {
  const idx = j * size + i;
  if (isWaterCell(grids, idx)) return 0;
  let sum = 0;
  let count = 0;
  for (let k = -radius; k <= radius; k++) {
    const ni = Math.max(0, Math.min(size - 1, i + k));
    const nIdx = j * size + ni;
    if (isWaterCell(grids, nIdx)) continue;
    sum += rawWeightChannel(grids, ni, j, channel, size);
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

let partialBlurScratch: Float32Array | null = null;
let partialWeightScratch: Float32Array | null = null;

function ensurePartialBlurScratch(length: number): Float32Array {
  if (!partialBlurScratch || partialBlurScratch.length < length) {
    partialBlurScratch = new Float32Array(length);
  }
  return partialBlurScratch;
}

function ensurePartialWeightScratch(length: number): Float32Array {
  if (!partialWeightScratch || partialWeightScratch.length < length) {
    partialWeightScratch = new Float32Array(length);
  }
  return partialWeightScratch;
}

function renormalizeLandWeightsAt(weights: Float32Array, offset: number, water: boolean): void {
  if (water) {
    weights[offset] = 0;
    weights[offset + 1] = 0;
    weights[offset + 2] = 0;
    weights[offset + 3] = 0;
    return;
  }
  const sum =
    weights[offset]! + weights[offset + 1]! + weights[offset + 2]! + weights[offset + 3]!;
  if (sum > 1e-6) {
    weights[offset] = weights[offset]! / sum;
    weights[offset + 1] = weights[offset + 1]! / sum;
    weights[offset + 2] = weights[offset + 2]! / sum;
    weights[offset + 3] = weights[offset + 3]! / sum;
  }
}

function bakeSmoothedBiomeWeightsInRegion(
  grids: MapGrids,
  writeRegion: GridDirtyRegion,
  blurRadius: number,
): Float32Array {
  const { size } = grids;
  const w = writeRegion.iMax - writeRegion.iMin + 1;
  const h = writeRegion.jMax - writeRegion.jMin + 1;
  const cellCount = w * h;
  const weights = ensurePartialWeightScratch(cellCount * 4);

  if (blurRadius <= 0) {
    for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
      for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
        const idx = j * size + i;
        const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
        const o = li * 4;
        if (isWaterCell(grids, idx)) {
          renormalizeLandWeightsAt(weights, o, true);
          continue;
        }
        const [wShore, wForest, wHills, wRock] = biomeIdToWeights(grids.biome[idx] as BiomeIdValue);
        weights[o] = wShore;
        weights[o + 1] = wForest;
        weights[o + 2] = wHills;
        weights[o + 3] = wRock;
        renormalizeLandWeightsAt(weights, o, false);
      }
    }
    return weights;
  }

  const horizRows = h + blurRadius * 2;
  const scratch = ensurePartialBlurScratch(horizRows * w);

  for (let channel = 0; channel < 4; channel++) {
    for (let lj = -blurRadius; lj < h + blurRadius; lj++) {
      const j = writeRegion.jMin + lj;
      if (j < 0 || j >= size) continue;
      const siRow = (lj + blurRadius) * w;
      for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
        const li = i - writeRegion.iMin;
        scratch[siRow + li] = horizontalBlurWeightChannel(
          grids,
          i,
          j,
          channel,
          blurRadius,
          size,
        );
      }
    }

    for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
      for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
        const li = i - writeRegion.iMin;
        const lj = j - writeRegion.jMin;
        let sum = 0;
        let count = 0;
        for (let k = -blurRadius; k <= blurRadius; k++) {
          const nj = j + k;
          const nlj = nj - writeRegion.jMin + blurRadius;
          if (nlj < 0 || nlj >= horizRows) continue;
          sum += scratch[nlj * w + li]!;
          count += 1;
        }
        weights[(lj * w + li) * 4 + channel] = count > 0 ? sum / count : 0;
      }
    }
  }

  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const idx = j * size + i;
      const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
      renormalizeLandWeightsAt(weights, li * 4, isWaterCell(grids, idx));
    }
  }

  return weights;
}

function writeRegionForBake(
  dirtyRegion: GridDirtyRegion,
  blurRadius: number,
  gridSize: number,
): GridDirtyRegion {
  return expandDirtyRegion(dirtyRegion, blurRadius, gridSize);
}

function horizontalBlurScalarAt(
  srcAt: (i: number, j: number) => number,
  i: number,
  j: number,
  radius: number,
  size: number,
): number {
  let sum = 0;
  let count = 0;
  for (let k = -radius; k <= radius; k++) {
    const ni = Math.max(0, Math.min(size - 1, i + k));
    sum += srcAt(ni, j);
    count += 1;
  }
  return sum / count;
}

function bakeBlurredScalarInRegion(
  grids: MapGrids,
  writeRegion: GridDirtyRegion,
  blurRadius: number,
  isOn: (id: BiomeIdValue) => boolean,
): Float32Array {
  const { size } = grids;
  const w = writeRegion.iMax - writeRegion.iMin + 1;
  const h = writeRegion.jMax - writeRegion.jMin + 1;
  const cellCount = w * h;
  const result = ensurePartialWeightScratch(cellCount);

  const rawAt = (i: number, j: number) => (isOn(grids.biome[j * size + i] as BiomeIdValue) ? 1 : 0);

  if (blurRadius <= 0) {
    for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
      for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
        const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
        result[li] = rawAt(i, j);
      }
    }
    return result;
  }

  const horizRows = h + blurRadius * 2;
  const scratch = ensurePartialBlurScratch(horizRows * w);

  for (let lj = -blurRadius; lj < h + blurRadius; lj++) {
    const j = writeRegion.jMin + lj;
    if (j < 0 || j >= size) continue;
    const siRow = (lj + blurRadius) * w;
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const li = i - writeRegion.iMin;
      scratch[siRow + li] = horizontalBlurScalarAt(rawAt, i, j, blurRadius, size);
    }
  }

  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const li = i - writeRegion.iMin;
      const lj = j - writeRegion.jMin;
      let sum = 0;
      let count = 0;
      for (let k = -blurRadius; k <= blurRadius; k++) {
        const nj = j + k;
        const nlj = nj - writeRegion.jMin + blurRadius;
        if (nlj < 0 || nlj >= horizRows) continue;
        sum += scratch[nlj * w + li]!;
        count += 1;
      }
      result[lj * w + li] = count > 0 ? sum / count : 0;
    }
  }

  return result;
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
  if (options?.region) {
    fillBiomeWeightTextureDataRegion(data, grids, options.region, options);
    return;
  }

  const weights = buildSmoothedBiomeWeights(grids, options);
  for (let i = 0; i < grids.biome.length; i++) {
    const o = i * 4;
    data[o] = Math.round(weights[o] * 255);
    data[o + 1] = Math.round(weights[o + 1] * 255);
    data[o + 2] = Math.round(weights[o + 2] * 255);
    data[o + 3] = Math.round(weights[o + 3] * 255);
  }
}

export function fillBiomeWeightTextureDataRegion(
  data: Uint8Array,
  grids: MapGrids,
  dirtyRegion: GridDirtyRegion,
  options?: BiomeWeightBakeOptions,
): void {
  const { size } = grids;
  const blurRadius = resolveBlurRadius(options);
  const writeRegion = writeRegionForBake(dirtyRegion, blurRadius, size);
  const weights = bakeSmoothedBiomeWeightsInRegion(grids, writeRegion, blurRadius);
  const w = writeRegion.iMax - writeRegion.iMin + 1;

  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const idx = j * size + i;
      const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
      const o = idx * 4;
      const wo = li * 4;
      data[o] = Math.round(weights[wo]! * 255);
      data[o + 1] = Math.round(weights[wo + 1]! * 255);
      data[o + 2] = Math.round(weights[wo + 2]! * 255);
      data[o + 3] = Math.round(weights[wo + 3]! * 255);
    }
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
  if (options?.region) {
    fillMeadowMaskTextureDataRegion(data, grids, options.region, options);
    return;
  }

  const blurred = buildBlurredMeadowMask(grids, options);
  for (let i = 0; i < blurred.length; i++) {
    data[i] = Math.round(Math.max(0, Math.min(1, blurred[i])) * 255);
  }
}

export function fillMeadowMaskTextureDataRegion(
  data: Uint8Array,
  grids: MapGrids,
  dirtyRegion: GridDirtyRegion,
  options?: BiomeWeightBakeOptions,
): void {
  const blurRadius = resolveBlurRadius(options);
  const writeRegion = writeRegionForBake(dirtyRegion, blurRadius, grids.size);
  const blurred = bakeBlurredScalarInRegion(
    grids,
    writeRegion,
    blurRadius,
    (id) => id === BiomeId.Meadow,
  );
  const w = writeRegion.iMax - writeRegion.iMin + 1;

  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const idx = j * grids.size + i;
      const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
      data[idx] = Math.round(Math.max(0, Math.min(1, blurred[li]!)) * 255);
    }
  }
}

export function fillPathMaskTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  if (options?.region) {
    fillPathMaskTextureDataRegion(data, grids, options.region, options);
    return;
  }

  const blurred = buildBlurredPathMask(grids, options);
  for (let i = 0; i < blurred.length; i++) {
    data[i] = Math.round(Math.max(0, Math.min(1, blurred[i])) * 255);
  }
}

export function fillPathMaskTextureDataRegion(
  data: Uint8Array,
  grids: MapGrids,
  dirtyRegion: GridDirtyRegion,
  options?: BiomeWeightBakeOptions,
): void {
  const blurRadius = resolveBlurRadius(options);
  const writeRegion = writeRegionForBake(dirtyRegion, blurRadius, grids.size);
  const blurred = bakeBlurredScalarInRegion(
    grids,
    writeRegion,
    blurRadius,
    (id) => id === BiomeId.Path,
  );
  const w = writeRegion.iMax - writeRegion.iMin + 1;

  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const idx = j * grids.size + i;
      const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
      data[idx] = Math.round(Math.max(0, Math.min(1, blurred[li]!)) * 255);
    }
  }
}
