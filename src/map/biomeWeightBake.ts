// src/map/biomeWeightBake.ts — smoothed biome weight bake for terrain + grass
import { VISUAL } from '../config/visualTuning';
import type { GridDirtyRegion } from './gridDirtyRegion';
import { expandDirtyRegion } from './gridDirtyRegion';
import type { MapGrids } from './MapGrids';
import { BiomeId, type BiomeIdValue } from './MapTypes';

const LAND_WEIGHT_RENORM_EPS = 1e-6;

export interface BiomeWeightBakeOptions {
  /** Blur radius in grid cells (0 = sharp one-hot weights). */
  blurRadiusCells?: number;
  /** When set, only rebake this painted region (+ blur margin). */
  region?: GridDirtyRegion;
}

export function defaultBiomeBlurRadiusCells(): number {
  return VISUAL.terrain.biomeBlendRadiusCells;
}

function biomeIdToWeights(id: BiomeIdValue): [number, number, number, number] {
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

function isWaterAt(grids: MapGrids, i: number, j: number, size: number): boolean {
  return isWaterCell(grids, j * size + i);
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
  const sum = weights[offset]! + weights[offset + 1]! + weights[offset + 2]! + weights[offset + 3]!;
  if (sum > LAND_WEIGHT_RENORM_EPS) {
    weights[offset] = weights[offset]! / sum;
    weights[offset + 1] = weights[offset + 1]! / sum;
    weights[offset + 2] = weights[offset + 2]! / sum;
    weights[offset + 3] = weights[offset + 3]! / sum;
  }
}

function renormalizeLandWeights(weights: Float32Array, size: number, waterMask: Uint8Array): void {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      renormalizeLandWeightsAt(weights, idx * 4, waterMask[idx] === 1);
    }
  }
}

function horizontalBoxBlurAt(
  i: number,
  j: number,
  radius: number,
  size: number,
  sample: (x: number, y: number) => number,
  skip?: (x: number, y: number) => boolean,
): number {
  if (skip?.(i, j)) return 0;
  let sum = 0;
  let count = 0;
  for (let k = -radius; k <= radius; k++) {
    const ni = Math.max(0, Math.min(size - 1, i + k));
    if (skip?.(ni, j)) continue;
    sum += sample(ni, j);
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function verticalBoxBlurAt(
  i: number,
  j: number,
  radius: number,
  size: number,
  scratch: Float32Array,
  skip?: (x: number, y: number) => boolean,
): number {
  if (skip?.(i, j)) return 0;
  let sum = 0;
  let count = 0;
  for (let k = -radius; k <= radius; k++) {
    const nj = Math.max(0, Math.min(size - 1, j + k));
    const nIdx = nj * size + i;
    if (skip?.(i, nj)) continue;
    sum += scratch[nIdx]!;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/** Full-grid separable box blur — stride 1 (scalar mask) or 4 (single RGBA channel). */
function separableBoxBlurFull(
  src: Float32Array,
  dst: Float32Array,
  scratch: Float32Array,
  size: number,
  radius: number,
  stride: 1 | 4,
  channel: number,
  skip?: (x: number, y: number) => boolean,
): void {
  if (radius <= 0) return;

  const read = (i: number, j: number) => {
    const idx = j * size + i;
    return stride === 1 ? src[idx]! : src[idx * 4 + channel]!;
  };

  const write = (i: number, j: number, value: number) => {
    const idx = j * size + i;
    if (stride === 1) dst[idx] = value;
    else dst[idx * 4 + channel] = value;
  };

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      if (skip?.(i, j)) {
        scratch[idx] = 0;
        continue;
      }
      scratch[idx] = horizontalBoxBlurAt(i, j, radius, size, read, skip);
    }
  }

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (skip?.(i, j)) {
        write(i, j, 0);
        continue;
      }
      write(i, j, verticalBoxBlurAt(i, j, radius, size, scratch, skip));
    }
  }
}

function fillRawLandWeights(grids: MapGrids, out: Float32Array): void {
  for (let i = 0; i < grids.biome.length; i++) {
    const [wShore, wForest, wHills, wRock] = biomeIdToWeights(grids.biome[i] as BiomeIdValue);
    const o = i * 4;
    out[o] = wShore;
    out[o + 1] = wForest;
    out[o + 2] = wHills;
    out[o + 3] = wRock;
  }
}

function fillRawLandWeightsInRegion(
  grids: MapGrids,
  writeRegion: GridDirtyRegion,
  weights: Float32Array,
): void {
  const { size } = grids;
  const w = writeRegion.iMax - writeRegion.iMin + 1;
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
}

function buildWaterMask(grids: MapGrids): Uint8Array {
  const mask = new Uint8Array(grids.biome.length);
  for (let i = 0; i < grids.biome.length; i++) {
    mask[i] = grids.biome[i] === BiomeId.Water ? 1 : 0;
  }
  return mask;
}

function writeRegionForBake(
  dirtyRegion: GridDirtyRegion,
  blurRadius: number,
  gridSize: number,
): GridDirtyRegion {
  return expandDirtyRegion(dirtyRegion, blurRadius, gridSize);
}

/**
 * Regional separable box blur with edge-clamped sampling (matches full-grid behavior).
 * stride 1 → scalar mask; stride 4 → one land-weight channel in an interleaved buffer.
 */
function separableBoxBlurRegion(
  writeRegion: GridDirtyRegion,
  radius: number,
  size: number,
  stride: 1 | 4,
  channel: number,
  sample: (x: number, y: number) => number,
  skip?: (x: number, y: number) => boolean,
): Float32Array {
  const w = writeRegion.iMax - writeRegion.iMin + 1;
  const h = writeRegion.jMax - writeRegion.jMin + 1;
  const cellCount = w * h;
  const out = ensurePartialWeightScratch(stride === 4 ? cellCount * 4 : cellCount);

  if (radius <= 0) {
    for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
      for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
        const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
        const value = sample(i, j);
        if (stride === 1) out[li] = value;
        else out[li * 4 + channel] = value;
      }
    }
    return out;
  }

  const horizRows = h + radius * 2;
  const scratch = ensurePartialBlurScratch(horizRows * w);

  for (let lj = 0; lj < horizRows; lj++) {
    const gridJ = writeRegion.jMin + lj - radius;
    const jSample = Math.max(0, Math.min(size - 1, gridJ));
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const li = i - writeRegion.iMin;
      scratch[lj * w + li] = horizontalBoxBlurAt(i, jSample, radius, size, sample, skip);
    }
  }

  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const li = i - writeRegion.iMin;
      const lj = j - writeRegion.jMin;
      const outIdx = stride === 1 ? lj * w + li : (lj * w + li) * 4 + channel;
      if (skip?.(i, j)) {
        if (stride === 1) out[outIdx] = 0;
        else out[outIdx] = 0;
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const nj = Math.max(0, Math.min(size - 1, j + k));
        if (skip?.(i, nj)) continue;
        const nlj = nj - writeRegion.jMin + radius;
        sum += scratch[nlj * w + li]!;
        count += 1;
      }
      out[outIdx] = count > 0 ? sum / count : 0;
    }
  }

  return out;
}

function bakeSmoothedBiomeWeightsInRegion(
  grids: MapGrids,
  writeRegion: GridDirtyRegion,
  blurRadius: number,
): Float32Array {
  const { size } = grids;
  const w = writeRegion.iMax - writeRegion.iMin + 1;
  const h = writeRegion.jMax - writeRegion.jMin + 1;
  const weights = ensurePartialWeightScratch(w * h * 4);

  if (blurRadius <= 0) {
    fillRawLandWeightsInRegion(grids, writeRegion, weights);
    return weights;
  }

  const skipWater = (i: number, j: number) => isWaterAt(grids, i, j, size);
  const sampleChannel = (channel: number) => (i: number, j: number) => {
    if (isWaterAt(grids, i, j, size)) return 0;
    return biomeIdToWeights(grids.biome[j * size + i] as BiomeIdValue)[channel]!;
  };

  for (let channel = 0; channel < 4; channel++) {
    const blurred = separableBoxBlurRegion(
      writeRegion,
      blurRadius,
      size,
      4,
      channel,
      sampleChannel(channel),
      skipWater,
    );
    for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
      for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
        const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
        weights[li * 4 + channel] = blurred[li * 4 + channel]!;
      }
    }
  }

  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
      renormalizeLandWeightsAt(weights, li * 4, isWaterAt(grids, i, j, size));
    }
  }

  return weights;
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
  fillRawLandWeights(grids, weights);

  if (radius <= 0) {
    renormalizeLandWeights(weights, size, waterMask);
    return weights;
  }

  const scratch = new Float32Array(count);
  const blurred = new Float32Array(count * 4);
  const skipWater = (i: number, j: number) => waterMask[j * size + i] === 1;

  for (let channel = 0; channel < 4; channel++) {
    separableBoxBlurFull(weights, blurred, scratch, size, radius, 4, channel, skipWater);
    for (let i = 0; i < count; i++) {
      weights[i * 4 + channel] = blurred[i * 4 + channel]!;
    }
  }

  renormalizeLandWeights(weights, size, waterMask);
  return weights;
}

function buildBlurredBiomeMask(
  grids: MapGrids,
  biomeId: BiomeIdValue,
  options?: BiomeWeightBakeOptions,
): Float32Array {
  const { size } = grids;
  const count = size * size;
  const radius = resolveBlurRadius(options);
  const raw = new Float32Array(count);

  for (let i = 0; i < grids.biome.length; i++) {
    raw[i] = grids.biome[i] === biomeId ? 1 : 0;
  }

  if (radius <= 0) return raw;

  const scratch = new Float32Array(count);
  const blurred = new Float32Array(count);
  separableBoxBlurFull(raw, blurred, scratch, size, radius, 1, 0);
  return blurred;
}

function bakeBlurredBiomeMaskInRegion(
  grids: MapGrids,
  writeRegion: GridDirtyRegion,
  blurRadius: number,
  biomeId: BiomeIdValue,
): Float32Array {
  const { size } = grids;
  const sample = (i: number, j: number) => (grids.biome[j * size + i] === biomeId ? 1 : 0);
  return separableBoxBlurRegion(writeRegion, blurRadius, size, 1, 0, sample);
}

/** Per-cell grass multiplier from path mask: pathDensity at center → 1 off-path. */
export function buildPathGrassMultiplier(
  grids: MapGrids,
  pathDensity: number,
  options?: BiomeWeightBakeOptions,
): Float32Array {
  const pathMask = buildBlurredBiomeMask(grids, BiomeId.Path, options);
  const mul = new Float32Array(pathMask.length);
  for (let i = 0; i < pathMask.length; i++) {
    mul[i] = pathDensity + (1 - pathDensity) * (1 - pathMask[i]!);
  }
  return mul;
}

function quantizeScalarMaskToUint8(data: Uint8Array, values: Float32Array): void {
  for (let i = 0; i < values.length; i++) {
    data[i] = Math.round(Math.max(0, Math.min(1, values[i]!)) * 255);
  }
}

function quantizeLandWeightsToUint8(
  data: Uint8Array,
  weights: Float32Array,
  cellCount: number,
): void {
  for (let i = 0; i < cellCount; i++) {
    const o = i * 4;
    data[o] = Math.round(weights[o]! * 255);
    data[o + 1] = Math.round(weights[o + 1]! * 255);
    data[o + 2] = Math.round(weights[o + 2]! * 255);
    data[o + 3] = Math.round(weights[o + 3]! * 255);
  }
}

function writeScalarMaskRegion(
  data: Uint8Array,
  values: Float32Array,
  grids: MapGrids,
  writeRegion: GridDirtyRegion,
): void {
  const w = writeRegion.iMax - writeRegion.iMin + 1;
  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const idx = j * grids.size + i;
      const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
      data[idx] = Math.round(Math.max(0, Math.min(1, values[li]!)) * 255);
    }
  }
}

function writeLandWeightsRegion(
  data: Uint8Array,
  weights: Float32Array,
  grids: MapGrids,
  writeRegion: GridDirtyRegion,
): void {
  const { size } = grids;
  const w = writeRegion.iMax - writeRegion.iMin + 1;
  for (let j = writeRegion.jMin; j <= writeRegion.jMax; j++) {
    for (let i = writeRegion.iMin; i <= writeRegion.iMax; i++) {
      const idx = j * size + i;
      const li = (j - writeRegion.jMin) * w + (i - writeRegion.iMin);
      const wo = li * 4;
      const o = idx * 4;
      data[o] = Math.round(weights[wo]! * 255);
      data[o + 1] = Math.round(weights[wo + 1]! * 255);
      data[o + 2] = Math.round(weights[wo + 2]! * 255);
      data[o + 3] = Math.round(weights[wo + 3]! * 255);
    }
  }
}

export function fillBiomeWeightTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  if (options?.region) {
    const blurRadius = resolveBlurRadius(options);
    const writeRegion = writeRegionForBake(options.region, blurRadius, grids.size);
    const weights = bakeSmoothedBiomeWeightsInRegion(grids, writeRegion, blurRadius);
    writeLandWeightsRegion(data, weights, grids, writeRegion);
    return;
  }

  const weights = buildSmoothedBiomeWeights(grids, options);
  quantizeLandWeightsToUint8(data, weights, grids.biome.length);
}

export function fillMeadowMaskTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  if (options?.region) {
    const blurRadius = resolveBlurRadius(options);
    const writeRegion = writeRegionForBake(options.region, blurRadius, grids.size);
    const blurred = bakeBlurredBiomeMaskInRegion(grids, writeRegion, blurRadius, BiomeId.Meadow);
    writeScalarMaskRegion(data, blurred, grids, writeRegion);
    return;
  }

  const blurred = buildBlurredBiomeMask(grids, BiomeId.Meadow, options);
  quantizeScalarMaskToUint8(data, blurred);
}

export function fillPathMaskTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  if (options?.region) {
    const blurRadius = resolveBlurRadius(options);
    const writeRegion = writeRegionForBake(options.region, blurRadius, grids.size);
    const blurred = bakeBlurredBiomeMaskInRegion(grids, writeRegion, blurRadius, BiomeId.Path);
    writeScalarMaskRegion(data, blurred, grids, writeRegion);
    return;
  }

  const blurred = buildBlurredBiomeMask(grids, BiomeId.Path, options);
  quantizeScalarMaskToUint8(data, blurred);
}
