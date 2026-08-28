// src/map/MapGrids.ts — height/biome grids, sampling, biome texture upload
import {
  Box2,
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  RGBAFormat,
  type Texture,
  UnsignedByteType,
  Vector2,
} from 'three';
import { WORLD } from '../config/world';
import type { GridDirtyRegion } from './authoring/gridDirtyRegion';
import { expandDirtyRegion, worldToGridFrac } from './authoring/gridDirtyRegion';
import {
  type BiomeWeightBakeOptions,
  defaultBiomeBlurRadiusCells,
  fillBiomeWeightTextureData,
  fillMeadowMaskTextureData,
  fillPathMaskTextureData,
} from './biomeWeightBake';
import { BiomeId, type BiomeIdValue, mapGridSize } from './MapTypes';

export type { BiomeWeightBakeOptions } from './biomeWeightBake';

/** Minimal renderer surface for regional GPU blits (WebGPURenderer). */
export interface GridTextureGpu {
  copyTextureToTexture: (
    srcTexture: Texture,
    dstTexture: Texture,
    srcRegion?: Box2 | null,
    dstPosition?: Vector2 | null,
    srcLevel?: number,
    dstLevel?: number,
  ) => void;
}

export interface MapGrids {
  readonly size: number;
  height: Float32Array;
  biome: Uint8Array;
  /** Optional packed RGBA8 aux (RG normal XZ, B slope, A convex). */
  terrainAux?: Uint8Array;
}

type GridTextureFillFn<T extends Uint8Array | Float32Array> = (
  data: T,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
) => void;

const GPU_TILE = 128;
const _gpuSrcBox = new Box2();
const _gpuDstPos = new Vector2();

type StagingKind = 'r32f' | 'rgba8' | 'r8';

interface StagingSlot {
  tex: DataTexture;
}

const stagingPool = new Map<StagingKind, StagingSlot>();

function stagingKind(
  format: typeof RedFormat | typeof RGBAFormat,
  type: typeof UnsignedByteType | typeof FloatType,
): StagingKind {
  if (type === FloatType) return 'r32f';
  return format === RGBAFormat ? 'rgba8' : 'r8';
}

function ensureStaging(kind: StagingKind): DataTexture {
  const existing = stagingPool.get(kind);
  if (existing) return existing.tex;

  const format = kind === 'rgba8' ? RGBAFormat : RedFormat;
  const type = kind === 'r32f' ? FloatType : UnsignedByteType;
  const components = kind === 'rgba8' ? 4 : 1;
  const count = GPU_TILE * GPU_TILE * components;
  const data = type === FloatType ? new Float32Array(count) : new Uint8Array(count);
  const tex = new DataTexture(data, GPU_TILE, GPU_TILE, format, type);
  applyDataTextureDefaults(tex);
  tex.generateMipmaps = false;
  tex.flipY = false;
  stagingPool.set(kind, { tex });
  return tex;
}

function copyCpuRegionToStaging(
  dest: DataTexture,
  staging: DataTexture,
  region: GridDirtyRegion,
  components: 1 | 4,
): { width: number; height: number } {
  const src = dest.image.data as Float32Array | Uint8Array;
  const dst = staging.image.data as Float32Array | Uint8Array;
  const srcW = dest.image.width;
  const width = region.iMax - region.iMin + 1;
  const height = region.jMax - region.jMin + 1;
  const stagingW = staging.image.width;
  for (let y = 0; y < height; y++) {
    const srcStart = ((region.jMin + y) * srcW + region.iMin) * components;
    const dstStart = y * stagingW * components;
    const count = width * components;
    for (let k = 0; k < count; k++) {
      dst[dstStart + k] = src[srcStart + k]!;
    }
  }
  return { width, height };
}

function copyGridTextureRegionGpu(
  renderer: GridTextureGpu,
  dest: DataTexture,
  region: GridDirtyRegion,
  components: 1 | 4,
): void {
  const kind = stagingKind(
    dest.format as typeof RedFormat | typeof RGBAFormat,
    dest.type as typeof UnsignedByteType | typeof FloatType,
  );
  const staging = ensureStaging(kind);

  for (let j0 = region.jMin; j0 <= region.jMax; j0 += GPU_TILE) {
    for (let i0 = region.iMin; i0 <= region.iMax; i0 += GPU_TILE) {
      const tile: GridDirtyRegion = {
        iMin: i0,
        iMax: Math.min(region.iMax, i0 + GPU_TILE - 1),
        jMin: j0,
        jMax: Math.min(region.jMax, j0 + GPU_TILE - 1),
      };
      const { width, height } = copyCpuRegionToStaging(dest, staging, tile, components);
      staging.needsUpdate = true;
      _gpuSrcBox.min.set(0, 0);
      _gpuSrcBox.max.set(width, height);
      _gpuDstPos.set(tile.iMin, tile.jMin);
      renderer.copyTextureToTexture(staging, dest, _gpuSrcBox, _gpuDstPos);
    }
  }
}

function bakeGpuWriteRegion(
  options: BiomeWeightBakeOptions | undefined,
  gridSize: number,
): GridDirtyRegion | undefined {
  if (!options?.region) return undefined;
  const blur = Math.max(0, Math.round(options.blurRadiusCells ?? defaultBiomeBlurRadiusCells()));
  return blur > 0 ? expandDirtyRegion(options.region, blur, gridSize) : options.region;
}

function commitGridTextureUpload(
  tex: DataTexture,
  region: GridDirtyRegion | undefined,
  components: 1 | 4,
  renderer?: GridTextureGpu | null,
): void {
  if (region && renderer) {
    try {
      copyGridTextureRegionGpu(renderer, tex, region, components);
      return;
    } catch {
      /* dest not on GPU yet — full upload */
    }
  }
  tex.needsUpdate = true;
}

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
  options: BiomeWeightBakeOptions | undefined,
  components: 1 | 4,
  renderer?: GridTextureGpu | null,
): void {
  fill(tex.image.data as T, grids, options);
  commitGridTextureUpload(tex, bakeGpuWriteRegion(options, grids.size), components, renderer);
}

function fillBiomeIdTextureData(
  data: Uint8Array,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  const { size, biome } = grids;
  const region = options?.region;
  if (region) {
    for (let j = region.jMin; j <= region.jMax; j++) {
      for (let i = region.iMin; i <= region.iMax; i++) {
        const idx = j * size + i;
        data[idx] = biome[idx]!;
      }
    }
    return;
  }
  data.set(biome);
}

export function createBiomeIdTexture(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): DataTexture {
  const count = grids.size * grids.size;
  return createGridTexture(
    grids,
    RedFormat,
    UnsignedByteType,
    count,
    fillBiomeIdTextureData,
    options,
  );
}

export function updateBiomeIdTexture(
  tex: DataTexture,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
  renderer?: GridTextureGpu | null,
): void {
  updateGridTexture(tex, grids, fillBiomeIdTextureData, options, 1, renderer);
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
  renderer?: GridTextureGpu | null,
): void {
  updateGridTexture(tex, grids, fillPathMaskTextureData, options, 1, renderer);
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
  renderer?: GridTextureGpu | null,
): void {
  updateGridTexture(tex, grids, fillMeadowMaskTextureData, options, 1, renderer);
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
  renderer?: GridTextureGpu | null,
): void {
  updateGridTexture(tex, grids, fillBiomeWeightTextureData, options, 4, renderer);
}

/** Authored height as worldY / HEIGHT_SCALE (may be signed). Float32 avoids 8-bit banding. */
function fillHeightTextureData(data: Float32Array, grids: MapGrids): void {
  for (let i = 0; i < grids.height.length; i++) {
    const h = grids.height[i]!;
    data[i] = Number.isFinite(h) ? h : 0;
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
      const h = grids.height[idx]!;
      data[idx] = Number.isFinite(h) ? h : 0;
    }
  }
}

export function updateHeightTexture(
  tex: DataTexture,
  grids: MapGrids,
  region?: GridDirtyRegion,
  renderer?: GridTextureGpu | null,
): void {
  const data = tex.image.data as Float32Array;
  if (region) fillHeightTextureDataRegion(data, grids, region);
  else fillHeightTextureData(data, grids);
  commitGridTextureUpload(tex, region, 1, renderer);
}

const TERRAIN_AUX_FLAT = 128;

function fillTerrainAuxTextureData(data: Uint8Array, grids: MapGrids): void {
  const expected = grids.size * grids.size * 4;
  if (grids.terrainAux && grids.terrainAux.length === expected) {
    data.set(grids.terrainAux);
    return;
  }
  for (let i = 0; i < grids.size * grids.size; i++) {
    const o = i * 4;
    data[o] = TERRAIN_AUX_FLAT;
    data[o + 1] = TERRAIN_AUX_FLAT;
    data[o + 2] = 0;
    data[o + 3] = 0;
  }
}

export function createTerrainAuxTexture(grids: MapGrids): DataTexture {
  const count = grids.size * grids.size * 4;
  return createGridTexture(grids, RGBAFormat, UnsignedByteType, count, fillTerrainAuxTextureData);
}

export function updateTerrainAuxTexture(
  tex: DataTexture,
  grids: MapGrids,
  region?: GridDirtyRegion,
  renderer?: GridTextureGpu | null,
): void {
  fillTerrainAuxTextureData(tex.image.data as Uint8Array, grids);
  commitGridTextureUpload(tex, region, 4, renderer);
}
