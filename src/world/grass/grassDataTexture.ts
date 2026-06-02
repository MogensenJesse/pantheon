// src/world/grass/grassDataTexture.ts — merged height + grass mask for compute (Tier 2A)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import type { MapGrids } from '../../map/MapGrids';
import { BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { MapGrassUniforms } from '../../map/mapGrassSettings';

/** R = height norm, G = grass weight, B = off-path (255 = grass allowed on path mask). */
export interface GrassDataDensities {
  forestDensity: number;
  hillsDensity: number;
  shoreDensity: number;
  biomeGrassThreshold: number;
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
    default:
      return [0, 1, 0, 0];
  }
}

/** Matches grass compute: shore×forestDensity + forest×hillsDensity + hills×shoreDensity. */
export function grassWeightForCell(
  wShore: number,
  wForest: number,
  wHills: number,
  densities: GrassDataDensities,
): number {
  return (
    wShore * densities.forestDensity +
    wForest * densities.hillsDensity +
    wHills * densities.shoreDensity
  );
}

export function fillGrassDataTexture(
  data: Uint8Array,
  grids: MapGrids,
  densities: GrassDataDensities,
): void {
  const { size } = grids;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const biomeId = grids.biome[idx] as BiomeIdValue;
      const [wShore, wForest, wHills] = biomeIdToWeights(biomeId);
      const o = idx * 4;

      const h = Math.max(0, Math.min(1, grids.height[idx]));
      data[o] = Math.round(h * 255);

      const grassWeight = grassWeightForCell(wShore, wForest, wHills, densities);
      data[o + 1] = Math.round(Math.max(0, Math.min(1, grassWeight)) * 255);

      const isPath = biomeId === BiomeId.Path;
      data[o + 2] = isPath ? 0 : 255;
      data[o + 3] = 0;
    }
  }
}

export function createGrassDataTexture(
  grids: MapGrids,
  densities: GrassDataDensities,
): DataTexture {
  const { size } = grids;
  const data = new Uint8Array(size * size * 4);
  fillGrassDataTexture(data, grids, densities);
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
): void {
  fillGrassDataTexture(tex.image.data as Uint8Array, grids, densities);
  tex.needsUpdate = true;
}

export function grassDataDensitiesFromUniforms(
  mapDensities: MapGrassUniforms,
  biomeGrassThreshold: number,
): GrassDataDensities {
  return {
    forestDensity: mapDensities.forestDensity,
    hillsDensity: mapDensities.hillsDensity,
    shoreDensity: mapDensities.shoreDensity,
    biomeGrassThreshold,
  };
}
