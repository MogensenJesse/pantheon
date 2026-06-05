// src/map/MapGrids.ts — height/biome grids, sampling, biome texture upload
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { WORLD } from '../world/WorldConfig';
import {
  type BiomeWeightBakeOptions,
  fillBiomeWeightTextureData,
  fillPathMaskTextureData,
} from './biomeWeightBake';
import { BiomeId, type BiomeIdValue, mapGridSize } from './MapTypes';

export type { BiomeWeightBakeOptions } from './biomeWeightBake';

export interface MapGrids {
  readonly size: number;
  height: Float32Array;
  biome: Uint8Array;
}

/** True when (x, z) lies on a painted Path biome cell or within `radius` metres of one. */
export function isNearPaintedPath(
  grids: MapGrids,
  x: number,
  z: number,
  radius: number,
  worldSize: number = WORLD.SIZE,
): boolean {
  const { u, v } = worldToGridFrac(x, z, worldSize, grids.size);
  const rCells = Math.ceil((radius / worldSize) * grids.size);
  const iCenter = Math.round(u);
  const jCenter = Math.round(v);
  const r2 = rCells * rCells;

  for (let j = 0; j < grids.size; j++) {
    for (let i = 0; i < grids.size; i++) {
      const di = i - iCenter;
      const dj = j - jCenter;
      if (di * di + dj * dj > r2) continue;
      if (grids.biome[j * grids.size + i] === BiomeId.Path) return true;
    }
  }
  return false;
}

export function createPathMaskTexture(
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): DataTexture {
  const { size } = grids;
  const data = new Uint8Array(size * size);
  fillPathMaskTextureData(data, grids, options);
  const tex = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function updatePathMaskTexture(
  tex: DataTexture,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  fillPathMaskTextureData(tex.image.data as Uint8Array, grids, options);
  tex.needsUpdate = true;
}

export function createEmptyMapGrids(size = mapGridSize()): MapGrids {
  const count = size * size;
  const height = new Float32Array(count);
  const biome = new Uint8Array(count);
  biome.fill(BiomeId.Shore);
  return { size, height, biome };
}

export function worldToGridFrac(
  x: number,
  z: number,
  size: number = WORLD.SIZE,
  gridSize: number = mapGridSize(),
): { u: number; v: number } {
  const u = x / size + 0.5;
  const v = z / size + 0.5;
  const max = gridSize - 1;
  return {
    u: Math.max(0, Math.min(max, u * max)),
    v: Math.max(0, Math.min(max, v * max)),
  };
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
  const { size } = grids;
  const data = new Uint8Array(size * size * 4);
  fillBiomeWeightTextureData(data, grids, options);
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function updateBiomeWeightTexture(
  tex: DataTexture,
  grids: MapGrids,
  options?: BiomeWeightBakeOptions,
): void {
  fillBiomeWeightTextureData(tex.image.data as Uint8Array, grids, options);
  tex.needsUpdate = true;
}
