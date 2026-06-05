// src/world/grass/grassDataTexture.ts — merged height + grass mask for compute (Tier 2A)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  buildPathOffMask,
  buildSmoothedBiomeWeights,
  defaultBiomeBlurRadiusCells,
  type BiomeWeightBakeOptions,
} from '../../map/biomeWeightBake';
import type { MapGrids } from '../../map/MapGrids';
import type { MapGrassUniforms } from '../../map/mapGrassSettings';

/** R = height norm, G = grass weight (includes path fade), B = reserved. */
export interface GrassDataDensities {
  forestDensity: number;
  hillsDensity: number;
  shoreDensity: number;
  biomeGrassThreshold: number;
}

export interface GrassDataTextureOptions extends BiomeWeightBakeOptions {
  /** Blur radius for path-off mask; defaults wider than biome blend for softer path edges. */
  pathBlurRadiusCells?: number;
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
  bakeOptions?: GrassDataTextureOptions,
): void {
  const { size } = grids;
  const blurOptions: BiomeWeightBakeOptions = {
    blurRadiusCells: bakeOptions?.blurRadiusCells ?? defaultBiomeBlurRadiusCells(),
  };
  const pathBlurOptions: BiomeWeightBakeOptions = {
    blurRadiusCells:
      bakeOptions?.pathBlurRadiusCells ??
      bakeOptions?.blurRadiusCells ??
      VISUAL.grass.pathOffMaskRadiusCells,
  };
  const smoothed = buildSmoothedBiomeWeights(grids, blurOptions);
  const pathOffMask = buildPathOffMask(grids, pathBlurOptions);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const o = idx * 4;
      const wShore = smoothed[o];
      const wForest = smoothed[o + 1];
      const wHills = smoothed[o + 2];

      const h = Math.max(0, Math.min(1, grids.height[idx]));
      data[o] = Math.round(h * 255);

      const grassWeight = grassWeightForCell(wShore, wForest, wHills, densities) * pathOffMask[idx];
      data[o + 1] = Math.round(Math.max(0, Math.min(1, grassWeight)) * 255);

      data[o + 2] = 255;
      data[o + 3] = 0;
    }
  }
}

export function createGrassDataTexture(
  grids: MapGrids,
  densities: GrassDataDensities,
  bakeOptions?: GrassDataTextureOptions,
): DataTexture {
  const { size } = grids;
  const data = new Uint8Array(size * size * 4);
  fillGrassDataTexture(data, grids, densities, bakeOptions);
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
  bakeOptions?: GrassDataTextureOptions,
): void {
  fillGrassDataTexture(tex.image.data as Uint8Array, grids, densities, bakeOptions);
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
