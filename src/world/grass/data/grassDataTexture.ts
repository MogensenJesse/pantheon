// src/world/grass/grassDataTexture.ts — merged height + grass mask for compute (Tier 2A)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { VISUAL } from '../../../config/visualTuning';
import {
  type BiomeWeightBakeOptions,
  buildBlurredMeadowMask,
  buildPathGrassMultiplier,
  buildSmoothedBiomeWeights,
  defaultBiomeBlurRadiusCells,
} from '../../../map/biomeWeightBake';
import type { MapGrids } from '../../../map/MapGrids';
import type { MapGrassUniforms } from '../../../map/mapGrassSettings';

/** R = height norm, G = grass weight (includes path fade), B = reserved. */
export interface GrassDataDensities {
  meadowDensity: number;
  forestDensity: number;
  hillsDensity: number;
  shoreDensity: number;
  mountainDensity: number;
  pathDensity: number;
  biomeGrassThreshold: number;
}

export interface GrassDataTextureOptions extends BiomeWeightBakeOptions {
  /** Blur radius for path grass mask; defaults wider than biome blend for softer path edges. */
  pathBlurRadiusCells?: number;
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
  const meadowMask = buildBlurredMeadowMask(grids, blurOptions);
  const pathGrassMul = buildPathGrassMultiplier(grids, densities.pathDensity, pathBlurOptions);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const o = idx * 4;
      const wShore = smoothed[o];
      const wForest = smoothed[o + 1];
      const wHills = smoothed[o + 2];
      const wRock = smoothed[o + 3];

      const h = Math.max(0, Math.min(1, grids.height[idx]));
      data[o] = Math.round(h * 255);

      const grassWeight = grassWeightForCell(
        wShore,
        wForest,
        wHills,
        wRock,
        meadowMask[idx],
        pathGrassMul[idx],
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
    meadowDensity: mapDensities.meadowDensity,
    forestDensity: mapDensities.forestDensity,
    hillsDensity: mapDensities.hillsDensity,
    shoreDensity: mapDensities.shoreDensity,
    mountainDensity: mapDensities.mountainDensity,
    pathDensity: mapDensities.pathDensity,
    biomeGrassThreshold,
  };
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
