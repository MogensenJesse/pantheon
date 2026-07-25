// src/map/authoring/heightRidgeStamp.ts — bake ridged noise into authored height grid

import type { MapGrids } from '../MapGrids';
import { BiomeId, type BiomeIdValue } from '../MapTypes';
import { forEachCellInDisc } from './gridBrush';
import { type RidgeNoiseParams, sampleRidgeNoise } from './ridgeNoise';

export interface HeightRidgeStampOptions {
  radius: number;
  worldSize: number;
  strength: number;
  noise: RidgeNoiseParams;
  /** When true, only stamp cells painted as Mountain. */
  onlyMountainBiome?: boolean;
}

export interface HeightRidgeSmoothOptions {
  radius: number;
  worldSize: number;
  strength: number;
  /** Box blur radius in grid cells (1 = 3×3). */
  blurRadiusCells?: number;
}

/** World XZ at cell center (matches height grid sampling). */
function gridCellToWorldXZ(
  i: number,
  j: number,
  grids: MapGrids,
  worldSize: number,
): { x: number; z: number } {
  const max = Math.max(1, grids.size - 1);
  const u = (i + 0.5) / max;
  const v = (j + 0.5) / max;
  return {
    x: (u - 0.5) * worldSize,
    z: (v - 0.5) * worldSize,
  };
}

function clampHeight(value: number): number {
  return Math.max(0, Math.min(1, value));
}

let ridgeSmoothScratch: Float32Array | null = null;

function ridgeSmoothScratchFor(length: number): Float32Array {
  if (!ridgeSmoothScratch || ridgeSmoothScratch.length !== length) {
    ridgeSmoothScratch = new Float32Array(length);
  }
  return ridgeSmoothScratch;
}

/** Add zero-mean ridged detail inside brush disc. */
export function stampRidgeDetail(
  grids: MapGrids,
  centerX: number,
  centerZ: number,
  options: HeightRidgeStampOptions,
): void {
  const { radius, worldSize, strength, noise, onlyMountainBiome = false } = options;

  forEachCellInDisc(grids, centerX, centerZ, { radius, worldSize }, (i, j, idx, falloff) => {
    if (onlyMountainBiome && grids.biome[idx] !== BiomeId.Mountain) return;
    const { x, z } = gridCellToWorldXZ(i, j, grids, worldSize);
    const n = sampleRidgeNoise(x, z, noise);
    const delta = (n - 0.5) * 2 * strength * falloff;
    grids.height[idx] = clampHeight(grids.height[idx]! + delta);
  });
}

/** Weighted box blur inside brush disc (ridge mode + Shift). */
export function smoothRidgeDetail(
  grids: MapGrids,
  centerX: number,
  centerZ: number,
  options: HeightRidgeSmoothOptions,
): void {
  const { radius, worldSize, strength, blurRadiusCells = 2 } = options;
  const size = grids.size;
  const scratch = ridgeSmoothScratchFor(grids.height.length);

  forEachCellInDisc(grids, centerX, centerZ, { radius, worldSize }, (i, j, idx, falloff) => {
    let sum = 0;
    let count = 0;
    for (let dj = -blurRadiusCells; dj <= blurRadiusCells; dj++) {
      for (let di = -blurRadiusCells; di <= blurRadiusCells; di++) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
        sum += grids.height[nj * size + ni]!;
        count++;
      }
    }
    const avg = count > 0 ? sum / count : grids.height[idx]!;
    const blend = strength * falloff;
    scratch[idx] = clampHeight(grids.height[idx]! * (1 - blend) + avg * blend);
  });

  forEachCellInDisc(grids, centerX, centerZ, { radius, worldSize }, (_i, _j, idx) => {
    grids.height[idx] = scratch[idx]!;
  });
}

export interface RidgeBiomeFillOptions {
  worldSize: number;
  strength: number;
  noise: RidgeNoiseParams;
  /** Defaults to Mountain only. */
  biomeIds?: readonly BiomeIdValue[];
}

/** One-shot ridge detail over all cells matching biomeIds (toolbar batch fill). */
export function applyRidgeDetailToBiome(grids: MapGrids, options: RidgeBiomeFillOptions): void {
  const { worldSize, strength, noise, biomeIds = [BiomeId.Mountain] } = options;
  const allowed = new Set(biomeIds);
  const size = grids.size;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      if (!allowed.has(grids.biome[idx] as BiomeIdValue)) continue;
      const { x, z } = gridCellToWorldXZ(i, j, grids, worldSize);
      const n = sampleRidgeNoise(x, z, noise);
      const delta = (n - 0.5) * 2 * strength;
      grids.height[idx] = clampHeight(grids.height[idx]! + delta);
    }
  }
}
