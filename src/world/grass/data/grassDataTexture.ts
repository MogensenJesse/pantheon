// src/world/grass/data/grassDataTexture.ts — RG8 grass weight + clump for compute
import {
  ClampToEdgeWrapping,
  DataTexture,
  type DataTexture as DataTextureType,
  LinearFilter,
  NoColorSpace,
  RGFormat,
  UnsignedByteType,
} from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { WORLD } from '../../../config/world';
import { devSettings } from '../../../core/GameState';
import type { MapGrids } from '../../../map/MapGrids';
import type { MapGrassUniforms } from '../../../map/mapGrassSettings';

/** R = grass weight (includes path fade), G = baked clump 0–1. Blade Y is sampled from terrain. */
const GRASS_DATA_STRIDE = 2;

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

/** Matches `three/tsl` `hash()` (pcg, Hash.js) so CPU clump patches line up with the old GPU field. */
function tslHash01(seed: number): number {
  const state = (Math.imul(seed >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return (((word >>> 22) ^ word) >>> 0) / 4294967296;
}

/** Same lattice mix as `hashLatticeCell` in vegetationVisibilityTsl. */
const HASH_CELL_OFFSET = 1 << 20;

function hashLatticeCell(ix: number, iz: number, salt: number): number {
  const ux = (ix + HASH_CELL_OFFSET) >>> 0;
  const uz = (iz + HASH_CELL_OFFSET) >>> 0;
  const mixed = ((Math.imul(ux, 73856093) ^ Math.imul(uz, 19349663)) + (salt >>> 0)) >>> 0;
  return tslHash01(mixed);
}

function vegetationValueNoise2(
  worldX: number,
  worldZ: number,
  invScale: number,
  salt: number,
): number {
  const gx = worldX * invScale;
  const gz = worldZ * invScale;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const fx = gx - x0;
  const fz = gz - z0;
  const ux = fx * fx * (3 - fx * 2);
  const uz = fz * fz * (3 - fz * 2);
  const n00 = hashLatticeCell(x0, z0, salt);
  const n10 = hashLatticeCell(x0 + 1, z0, salt);
  const n01 = hashLatticeCell(x0, z0 + 1, salt);
  const n11 = hashLatticeCell(x0 + 1, z0 + 1, salt);
  return (n00 * (1 - ux) + n10 * ux) * (1 - uz) + (n01 * (1 - ux) + n11 * ux) * uz;
}

function smoothstepEdges(lo: number, hi: number, x: number): number {
  const span = Math.max(hi - lo, 1e-6);
  const t = Math.max(0, Math.min(1, (x - lo) / span));
  return t * t * (3 - 2 * t);
}

function readClumpBakeParams(): { scaleM: number; coverage: number; softness: number } {
  const g = import.meta.env.DEV ? devSettings.grass : VISUAL.grass;
  return { scaleM: g.clumpScaleM, coverage: g.clumpCoverage, softness: g.clumpSoftness };
}

/** World-stable clump 0–1 after coverage/softness (strength + rim applied live on GPU). */
function bakedClumpAt(
  worldX: number,
  worldZ: number,
  scaleM: number,
  coverage: number,
  softness: number,
): number {
  const invScale = 1 / Math.max(scaleM, 1e-3);
  const n0 = vegetationValueNoise2(worldX, worldZ, invScale, 0);
  const n1 = vegetationValueNoise2(worldX, worldZ, invScale * 2, 17);
  const noise = n0 * 0.65 + n1 * 0.35;
  const lo = Math.max(0, Math.min(1, 1 - coverage - softness));
  const hi = Math.max(0, Math.min(1, 1 - coverage + softness));
  return smoothstepEdges(lo, Math.max(hi, lo + 1e-6), noise);
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
  const denom = Math.max(1, size - 1);
  const { scaleM, coverage, softness } = readClumpBakeParams();

  for (let j = 0; j < size; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(size - 1, j + 1);
    const worldZ = (j / denom - 0.5) * WORLD.SIZE;
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const biomeO = idx * 4;
      const o = idx * GRASS_DATA_STRIDE;
      const wShore = biomeWeights[biomeO]! / 255;
      const wForest = biomeWeights[biomeO + 1]! / 255;
      const wHills = biomeWeights[biomeO + 2]! / 255;
      const wRock = biomeWeights[biomeO + 3]! / 255;
      const meadow = meadowMask[idx]! / 255;
      const pathGrassMul = pathGrassMultiplier(pathMask[idx]! / 255, densities.pathDensity);

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
      data[o] = Math.round(Math.max(0, Math.min(1, grassWeight)) * 255);

      const worldX = (i / denom - 0.5) * WORLD.SIZE;
      data[o + 1] = Math.round(
        Math.max(0, Math.min(1, bakedClumpAt(worldX, worldZ, scaleM, coverage, softness))) * 255,
      );
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
  const data = new Uint8Array(size * size * GRASS_DATA_STRIDE);
  fillGrassDataTexture(data, grids, densities, terrainMaps, options);
  const tex = new DataTexture(data, size, size, RGFormat, UnsignedByteType);
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
  const pixelCount = grassData.length / GRASS_DATA_STRIDE;
  if (pixelCount <= 0) return 0;
  const t0 = threshold;
  const span = Math.min(0.15, Math.max(1e-6, fadeWidth));
  let sum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const w = grassData[i * GRASS_DATA_STRIDE]! / 255;
    const gate = smoothstep01((w - t0) / span);
    sum += w * gate;
  }
  return sum / pixelCount;
}
