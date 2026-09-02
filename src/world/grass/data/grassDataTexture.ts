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
import { VISUAL } from '../../../config/visualTuning';
import { WORLD } from '../../../config/world';
import type { MapGrids } from '../../../map/MapGrids';
import type { MapGrassUniforms } from '../../../map/mapGrassSettings';

/** R = height norm, G = grass weight (includes path fade). B/A unused (RGBA padding). */

export interface GrassTerrainMapSources {
  biomeMap: DataTextureType;
  meadowMap: DataTextureType;
  pathMap: DataTextureType;
}

export interface GrassDataFillOptions {
  /** Skip blades below this authored height (worldY / HEIGHT_SCALE). */
  waterHeightNorm?: number;
}

function grassWeightForCell(
  wShore: number,
  wForest: number,
  wHills: number,
  wRock: number,
  meadowMask: number,
  pathGrassMul: number,
  densities: MapGrassUniforms,
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
function fillGrassDataTexture(
  data: Uint8Array,
  grids: MapGrids,
  densities: MapGrassUniforms,
  terrainMaps: GrassTerrainMapSources,
  options: GrassDataFillOptions = {},
): void {
  const biomeWeights = terrainMaps.biomeMap.image.data as Uint8Array;
  const meadowMask = terrainMaps.meadowMap.image.data as Uint8Array;
  const pathMask = terrainMaps.pathMap.image.data as Uint8Array;
  const { size, height } = grids;
  const cellSize = WORLD.SIZE / Math.max(1, size - 1);
  const pack = VISUAL.terrain.packMaps;
  const t0 = pack.slope.maskLow;
  const t1 = pack.slope.maskHigh;
  const span = Math.max(1e-6, t1 - t0);

  for (let j = 0; j < size; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(size - 1, j + 1);
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const o = idx * 4;
      const wShore = biomeWeights[o]! / 255;
      const wForest = biomeWeights[o + 1]! / 255;
      const wHills = biomeWeights[o + 2]! / 255;
      const wRock = biomeWeights[o + 3]! / 255;
      const meadow = meadowMask[idx]! / 255;
      const pathGrassMul = pathGrassMultiplier(pathMask[idx]! / 255, densities.pathDensity);

      const h = Math.max(0, Math.min(1, height[idx]!));
      data[o] = Math.round(h * 255);

      let grassWeight = grassWeightForCell(
        wShore,
        wForest,
        wHills,
        wRock,
        meadow,
        pathGrassMul,
        densities,
      );
      if (options.waterHeightNorm !== undefined && height[idx]! < options.waterHeightNorm) {
        grassWeight = 0;
      }
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(size - 1, i + 1);
      const dhdx =
        ((height[j * size + i1]! - height[j * size + i0]!) * WORLD.HEIGHT_SCALE) /
        Math.max(1e-6, (i1 - i0) * cellSize);
      const dhdz =
        ((height[j1 * size + i]! - height[j0 * size + i]!) * WORLD.HEIGHT_SCALE) /
        Math.max(1e-6, (j1 - j0) * cellSize);
      const slopeMask = Math.min(1, Math.hypot(dhdx, dhdz) / 2.5);
      const x = Math.max(0, Math.min(1, (slopeMask - t0) / span));
      const rock = x * x * (3 - 2 * x);
      grassWeight *= 1 - rock * pack.grass.slopeKill;
      data[o + 1] = Math.round(Math.max(0, Math.min(1, grassWeight)) * 255);

      data[o + 2] = 0;
      data[o + 3] = 0;
    }
  }
}

export function createGrassDataTexture(
  grids: MapGrids,
  densities: MapGrassUniforms,
  terrainMaps: GrassTerrainMapSources,
  options: GrassDataFillOptions = {},
): DataTexture {
  const { size } = grids;
  const data = new Uint8Array(size * size * 4);
  fillGrassDataTexture(data, grids, densities, terrainMaps, options);
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
  densities: MapGrassUniforms,
  terrainMaps: GrassTerrainMapSources,
  options: GrassDataFillOptions = {},
): void {
  fillGrassDataTexture(tex.image.data as Uint8Array, grids, densities, terrainMaps, options);
  tex.needsUpdate = true;
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Expected stochastic visibility fraction from map grass weights (matches GPU keep). */
export function estimateGrassVisibilityFraction(
  grassData: Uint8Array,
  threshold: number,
  fadeWidth: number,
): number {
  const pixelCount = grassData.length / 4;
  if (pixelCount <= 0) return 0;
  const t0 = threshold;
  const span = Math.min(0.15, Math.max(1e-6, fadeWidth));
  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const w = grassData[i * 4 + 1]! / 255;
    const gate = smoothstep01((w - t0) / span);
    sum += w * gate;
  }
  return sum / pixelCount;
}
