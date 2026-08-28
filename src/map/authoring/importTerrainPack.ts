// src/map/authoring/importTerrainPack.ts — PNG height + optional convex → MapGrids + aux

import { PHASE0 } from '../../config/phase0.ts';
import { editor as editorVisual } from '../../config/visual/editor.ts';
import { WORLD } from '../../config/world.ts';
import type { MapGrids } from '../MapGrids.ts';
import {
  BiomeId,
  type BiomePaintRules,
  type MapEntity,
  type MapHeightMode,
  type MapTerrainAuxMeta,
  type MapTerrainShape,
  type MapWaterSettings,
  mapGridSize,
} from '../MapTypes.ts';
import { heightNormFromMetres, sanitizeHeightNorm } from '../mapHeightBounds.ts';
import { waterHeightNormFromLevelM } from '../mapWater.ts';
import { createFlatTerrainAux, writeTerrainAuxCell } from '../terrainAux.ts';
import { packBiomePaintRules } from './applyBiomeRules.ts';
import type { AspectFitRect } from './aspectFitGrid.ts';
import { aspectFitScalar } from './aspectFitGrid.ts';
import type { DecodedPngTerrain } from './decodePngTerrain.ts';

export const PACK_HEIGHT_MIN_M_DEFAULT = -21.75;
export const PACK_HEIGHT_MAX_M_DEFAULT = 265.52;
export const PACK_WATER_LEVEL_M_DEFAULT = 0;

export interface ImportTerrainPackOptions {
  height: DecodedPngTerrain;
  convex?: DecodedPngTerrain;
  minM: number;
  maxM: number;
  waterLevelM?: number;
  flipY?: boolean;
}

export interface ImportedTerrainPack {
  grids: MapGrids;
  terrainAux: Uint8Array;
  auxMeta: MapTerrainAuxMeta;
  heightMode: MapHeightMode;
  water: MapWaterSettings;
  biomePaintRules: BiomePaintRules;
  entities: MapEntity[];
  terrainShape: MapTerrainShape;
  warnings: string[];
  stats: {
    srcW: number;
    srcH: number;
    depth: number;
    minM: number;
    maxM: number;
    rect: AspectFitRect;
  };
}

function assertMatchingSize(
  height: DecodedPngTerrain,
  other: DecodedPngTerrain | undefined,
  label: string,
): void {
  if (!other) return;
  if (other.width !== height.width || other.height !== height.height) {
    throw new Error(
      `${label} map is ${other.width}×${other.height}, expected ${height.width}×${height.height} to match height`,
    );
  }
}

function gridToWorld(
  i: number,
  j: number,
  size: number,
  worldSize: number,
): { x: number; z: number } {
  const max = Math.max(1, size - 1);
  return {
    x: (i / max - 0.5) * worldSize,
    z: (j / max - 0.5) * worldSize,
  };
}

function pickPlayerStart(grids: MapGrids, waterNorm: number): MapEntity {
  const { size, height, biome } = grids;
  const cx = (size / 2) | 0;
  const cz = (size / 2) | 0;
  const maxR = Math.max(cx, cz, size - 1 - cx, size - 1 - cz);
  for (let r = 0; r <= maxR; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r && r > 0) continue;
        const i = cx + di;
        const j = cz + dj;
        if (i < 0 || j < 0 || i >= size || j >= size) continue;
        const idx = j * size + i;
        if (biome[idx] === BiomeId.Water) continue;
        if (height[idx]! < waterNorm + 0.01) continue;
        if (height[idx]! > 0.7) continue;
        const { x, z } = gridToWorld(i, j, size, WORLD.SIZE);
        return { type: 'playerStart', x, z, rotY: PHASE0.CAMERA.INITIAL_YAW };
      }
    }
  }
  return { type: 'playerStart', x: 0, z: 0, rotY: PHASE0.CAMERA.INITIAL_YAW };
}

function classifyCell(
  heightNorm: number,
  slopeMask: number,
  waterNorm: number,
): (typeof BiomeId)[keyof typeof BiomeId] {
  if (heightNorm < waterNorm) return BiomeId.Water;
  if (slopeMask > 0.55 || heightNorm > 0.72) return BiomeId.Mountain;
  if (heightNorm > WORLD.BIOMES.SHORE.max) return BiomeId.Hills;
  if (heightNorm > 0.12 && heightNorm < 0.36 && slopeMask < 0.25) return BiomeId.Meadow;
  if (heightNorm < 0.22) return BiomeId.Shore;
  return BiomeId.Forest;
}

function fillBiomes(grids: MapGrids, waterNorm: number): void {
  const { size, height, biome } = grids;
  const cellSize = WORLD.SIZE / Math.max(1, size - 1);
  for (let j = 0; j < size; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(size - 1, j + 1);
    for (let i = 0; i < size; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(size - 1, i + 1);
      const idx = j * size + i;
      const dhdx =
        ((height[j * size + i1]! - height[j * size + i0]!) * WORLD.HEIGHT_SCALE) /
        Math.max(1e-6, (i1 - i0) * cellSize);
      const dhdz =
        ((height[j1 * size + i]! - height[j0 * size + i]!) * WORLD.HEIGHT_SCALE) /
        Math.max(1e-6, (j1 - j0) * cellSize);
      const slopeMask = Math.min(1, Math.hypot(dhdx, dhdz) / 2.5);
      biome[idx] = classifyCell(height[idx]!, slopeMask, waterNorm);
    }
  }
}

function edgeHeightWarning(height: Float32Array, size: number, rect: AspectFitRect): string | null {
  if (rect.dstW <= 2 || rect.dstH <= 2) return null;
  let sum = 0;
  let count = 0;
  const sample = (i: number, j: number) => {
    sum += height[j * size + i]!;
    count++;
  };
  for (let i = rect.i0; i < rect.i0 + rect.dstW; i++) {
    sample(i, rect.j0);
    sample(i, rect.j0 + rect.dstH - 1);
  }
  for (let j = rect.j0 + 1; j < rect.j0 + rect.dstH - 1; j++) {
    sample(rect.i0, j);
    sample(rect.i0 + rect.dstW - 1, j);
  }
  if (count === 0) return null;
  const meanM = (sum / count) * WORLD.HEIGHT_SCALE;
  if (Math.abs(meanM) > 2) {
    return `Source edge height averages ${meanM.toFixed(1)} m vs 0 m pad — a seam may show at the letterbox.`;
  }
  return null;
}

export function importTerrainPack(options: ImportTerrainPackOptions): ImportedTerrainPack {
  const { height } = options;
  assertMatchingSize(height, options.convex, 'Convex');

  if (
    !Number.isFinite(options.minM) ||
    !Number.isFinite(options.maxM) ||
    options.maxM <= options.minM
  ) {
    throw new Error('Height metadata needs finite Min < Max metres');
  }

  const dstSize = mapGridSize();
  const flipY = options.flipY === true;
  const rangeM = options.maxM - options.minM;
  const metres = new Float32Array(height.gray.length);
  for (let i = 0; i < height.gray.length; i++) {
    metres[i] = options.minM + height.gray[i]! * rangeM;
  }

  const fittedHeight = aspectFitScalar(metres, height.width, height.height, dstSize, 0, flipY);
  const count = dstSize * dstSize;
  const grids: MapGrids = {
    size: dstSize,
    height: new Float32Array(count),
    biome: new Uint8Array(count),
  };
  for (let i = 0; i < count; i++) {
    grids.height[i] = sanitizeHeightNorm(heightNormFromMetres(fittedHeight.data[i]!));
  }

  const aux = createFlatTerrainAux(dstSize);
  const warnings: string[] = [];
  if (height.depth === 8) {
    warnings.push(
      `Height PNG is 8-bit (~${(rangeM / 255).toFixed(2)} m/step). Prefer 16-bit to avoid terracing.`,
    );
  }
  const edgeWarn = edgeHeightWarning(grids.height, dstSize, fittedHeight.rect);
  if (edgeWarn) warnings.push(edgeWarn);

  let hasConvex = false;
  if (options.convex) {
    const fitted = aspectFitScalar(
      options.convex.gray,
      options.convex.width,
      options.convex.height,
      dstSize,
      0,
      flipY,
    );
    for (let j = 0; j < fitted.rect.dstH; j++) {
      for (let i = 0; i < fitted.rect.dstW; i++) {
        const idx = (fitted.rect.j0 + j) * dstSize + (fitted.rect.i0 + i);
        writeTerrainAuxCell(aux, idx, { convex: fitted.data[idx]! });
      }
    }
    hasConvex = true;
  }

  const waterLevelM = options.waterLevelM ?? PACK_WATER_LEVEL_M_DEFAULT;
  const waterNorm = waterHeightNormFromLevelM(waterLevelM);
  fillBiomes(grids, waterNorm);
  grids.terrainAux = aux;

  const auxMeta: MapTerrainAuxMeta = {
    hasSlope: false,
    hasConvex,
    hasNormal: false,
    stale: false,
  };

  return {
    grids,
    terrainAux: aux,
    auxMeta,
    heightMode: 'rawSigned',
    water: { levelM: waterLevelM },
    biomePaintRules: packBiomePaintRules(waterNorm),
    entities: [pickPlayerStart(grids, waterNorm)],
    terrainShape: { ...editorVisual.terrainShape, talusPasses: 0 },
    warnings,
    stats: {
      srcW: height.width,
      srcH: height.height,
      depth: height.depth,
      minM: options.minM,
      maxM: options.maxM,
      rect: fittedHeight.rect,
    },
  };
}
