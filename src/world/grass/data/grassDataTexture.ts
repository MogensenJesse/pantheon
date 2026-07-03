// src/world/grass/data/grassDataTexture.ts — merged height + grass mask for compute (Tier 2A)
import {
  ClampToEdgeWrapping,
  DataTexture,
  type DataTexture as DataTextureType,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import type { MapGrids } from '../../../map/MapGrids';
import type { MapGrassUniforms } from '../../../map/mapGrassSettings';

/** R = height norm, G = grass weight (includes path fade), B = reserved. */
export type GrassDataDensities = MapGrassUniforms;

export interface GrassTerrainMapSources {
  biomeMap: DataTextureType;
  meadowMap: DataTextureType;
  pathMap: DataTextureType;
}

export function grassWeightForCell(
  wShore: number,
  wForest: number,
  wHills: number,
  wRock: number,
  meadowMask: number,
  pathGrassMul: number,
  densities: GrassDataDensities,
): number {
  const biomeWeight =
    wShore * densities.shoreDensity +
    wForest * densities.forestDensity +
    wHills * densities.hillsDensity +
    wRock * densities.mountainDensity +
    meadowMask * densities.meadowDensity;
  return biomeWeight * pathGrassMul;
}

function pathGrassMultiplier(pathMask: number, pathDensity: number): number {
  return pathDensity + (1 - pathDensity) * (1 - pathMask);
}

/** Sample terrain biome/meadow/path map pixels (already blurred at terrain bake). */
export function fillGrassDataTexture(
  data: Uint8Array,
  grids: MapGrids,
  densities: GrassDataDensities,
  terrainMaps: GrassTerrainMapSources,
): void {
  const biomeWeights = terrainMaps.biomeMap.image.data as Uint8Array;
  const meadowMask = terrainMaps.meadowMap.image.data as Uint8Array;
  const pathMask = terrainMaps.pathMap.image.data as Uint8Array;
  const { size } = grids;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const o = idx * 4;
      const wShore = biomeWeights[o]! / 255;
      const wForest = biomeWeights[o + 1]! / 255;
      const wHills = biomeWeights[o + 2]! / 255;
      const wRock = biomeWeights[o + 3]! / 255;
      const meadow = meadowMask[idx]! / 255;
      const pathGrassMul = pathGrassMultiplier(pathMask[idx]! / 255, densities.pathDensity);

      const h = Math.max(0, Math.min(1, grids.height[idx]!));
      data[o] = Math.round(h * 255);

      const grassWeight = grassWeightForCell(
        wShore,
        wForest,
        wHills,
        wRock,
        meadow,
        pathGrassMul,
        densities,
      );
      data[o + 1] = Math.round(Math.max(0, Math.min(1, grassWeight)) * 255);

      data[o + 2] = 255;
      data[o + 3] = 0;
    }
  }
}

export function createGrassDataTexture(
  grids: MapGrids,
  densities: GrassDataDensities,
  terrainMaps: GrassTerrainMapSources,
): DataTexture {
  const { size } = grids;
  const data = new Uint8Array(size * size * 4);
  fillGrassDataTexture(data, grids, densities, terrainMaps);
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function updateGrassDataTexture(
  tex: DataTexture,
  grids: MapGrids,
  densities: GrassDataDensities,
  terrainMaps: GrassTerrainMapSources,
): void {
  fillGrassDataTexture(tex.image.data as Uint8Array, grids, densities, terrainMaps);
  tex.needsUpdate = true;
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Expected stochastic visibility fraction from map grass weights (matches GPU smoothstep cull). */
export function estimateGrassVisibilityFraction(
  grassData: Uint8Array,
  threshold: number,
  fadeWidth: number,
): number {
  const pixelCount = grassData.length / 4;
  if (pixelCount <= 0) return 0;
  const t0 = threshold;
  const t1 = threshold + fadeWidth;
  const span = Math.max(1e-6, t1 - t0);
  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const w = grassData[i * 4 + 1]! / 255;
    sum += smoothstep01((w - t0) / span);
  }
  return sum / pixelCount;
}
