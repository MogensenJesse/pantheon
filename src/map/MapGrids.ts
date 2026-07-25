// src/map/MapGrids.ts — height/biome grids, sampling, biome texture upload
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { WORLD } from '../config/world';
import type { GridDirtyRegion } from './authoring/gridDirtyRegion';
import { worldToGridFrac } from './authoring/gridDirtyRegion';
import {
  type BiomeWeightBakeOptions,
  fillBiomeWeightTextureData,
  fillMeadowMaskTextureData,
  fillPathMaskTextureData,
} from './biomeWeightBake';
import { BiomeId, type BiomeIdValue, mapGridSize } from './MapTypes';

export type { BiomeWeightBakeOptions } from './biomeWeightBake';

export interface MapGrids {
  readonly size: number;
  height: Float32Array;
  biome: Uint8Array;
}

type GridTextureFillFn<T extends Uint8Array | Float32Array> = (
  data: T,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
) => void;

function applyDataTextureDefaults(tex: DataTexture): void {
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
}

function createGridTexture<T extends Uint8Array | Float32Array>(
  grids: MapGrids,
  format: typeof RedFormat | typeof RGBAFormat,
  type: typeof UnsignedByteType | typeof FloatType,
  elementCount: number,
  fill: GridTextureFillFn<T>,
  options?: BiomeWeightBakeOptions,
): DataTexture {
  const { size } = grids;
  const data = (
    type === FloatType ? new Float32Array(elementCount) : new Uint8Array(elementCount)
  ) as T;
  fill(data, grids, options);
  const tex = new DataTexture(data, size, size, format, type);
  applyDataTextureDefaults(tex);
  tex.needsUpdate = true;
  return tex;
}

function updateGridTexture<T extends Uint8Array | Float32Array>(
  tex: DataTexture,
  grids: MapGrids,
  fill: GridTextureFillFn<T>,
  options?: BiomeWeightBakeOptions,
): void {
  fill(tex.image.data as T, grids, options);
  tex.needsUpdate = true;
}

export function createPathMaskTexture(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): DataTexture {
  const count = grids.size * grids.size;
  return createGridTexture(
    grids,
    RedFormat,
    UnsignedByteType,
    count,
    fillPathMaskTextureData,
    options,
  );
}

export function updatePathMaskTexture(
  tex: DataTexture,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  updateGridTexture(tex, grids, fillPathMaskTextureData, options);
}

export function createMeadowMaskTexture(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): DataTexture {
  const count = grids.size * grids.size;
  return createGridTexture(
    grids,
    RedFormat,
    UnsignedByteType,
    count,
    fillMeadowMaskTextureData,
    options,
  );
}

export function updateMeadowMaskTexture(
  tex: DataTexture,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  updateGridTexture(tex, grids, fillMeadowMaskTextureData, options);
}

export function createEmptyMapGrids(size = mapGridSize()): MapGrids {
  const count = size * size;
  const height = new Float32Array(count);
  const biome = new Uint8Array(count);
  biome.fill(BiomeId.Shore);
  return { size, height, biome };
}

/** Nearest painted biome cell at world (x, z). */
export function sampleBiomeNearest(
  grids: MapGrids,
  x: number,
  z: number,
  worldSize = WORLD.SIZE,
): BiomeIdValue {
  const { u, v } = worldToGridFrac(x, z, worldSize, grids.size);
  const i = Math.round(u);
  const j = Math.round(v);
  return grids.biome[j * grids.size + i] as BiomeIdValue;
}

export function sampleHeightBilinear(
  grids: MapGrids,
  x: number,
  z: number,
  worldSize = WORLD.SIZE,
): number {
  const { u, v } = worldToGridFrac(x, z, worldSize, grids.size);
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(grids.size - 1, i0 + 1);
  const j1 = Math.min(grids.size - 1, j0 + 1);
  const tx = u - i0;
  const ty = v - j0;
  const h00 = grids.height[j0 * grids.size + i0];
  const h10 = grids.height[j0 * grids.size + i1];
  const h01 = grids.height[j1 * grids.size + i0];
  const h11 = grids.height[j1 * grids.size + i1];
  const h0 = h00 * (1 - tx) + h10 * tx;
  const h1 = h01 * (1 - tx) + h11 * tx;
  return h0 * (1 - ty) + h1 * ty;
}

export function createBiomeWeightTexture(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): DataTexture {
  const count = grids.size * grids.size * 4;
  return createGridTexture(
    grids,
    RGBAFormat,
    UnsignedByteType,
    count,
    fillBiomeWeightTextureData,
    options,
  );
}

export function updateBiomeWeightTexture(
  tex: DataTexture,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  updateGridTexture(tex, grids, fillBiomeWeightTextureData, options);
}

/** Normalized sculpt height (0–1) for GPU macro displacement — Float32 avoids 8-bit banding at HEIGHT_SCALE. */
function fillHeightTextureData(data: Float32Array, grids: MapGrids): void {
  for (let i = 0; i < grids.height.length; i++) {
    data[i] = Math.max(0, Math.min(1, grids.height[i]!));
  }
}

export function createHeightTexture(grids: MapGrids): DataTexture {
  const count = grids.size * grids.size;
  return createGridTexture(grids, RedFormat, FloatType, count, fillHeightTextureData);
}

function fillHeightTextureDataRegion(
  data: Float32Array,
  grids: MapGrids,
  region: GridDirtyRegion,
): void {
  const { size } = grids;
  for (let j = region.jMin; j <= region.jMax; j++) {
    for (let i = region.iMin; i <= region.iMax; i++) {
      const idx = j * size + i;
      data[idx] = Math.max(0, Math.min(1, grids.height[idx]!));
    }
  }
}

export function updateHeightTexture(
  tex: DataTexture,
  grids: MapGrids,
  region?: GridDirtyRegion,
): void {
  const data = tex.image.data as Float32Array;
  if (region) fillHeightTextureDataRegion(data, grids, region);
  else fillHeightTextureData(data, grids);
  tex.needsUpdate = true;
}
