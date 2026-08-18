// src/map/authoring/heightSmoothDisc.ts — weighted separable box-blur soften inside a brush disc

import type { MapGrids } from '../MapGrids';
import { forEachCellInDisc } from './gridBrush';
import { discGridLayout, expandDirtyRegion } from './gridDirtyRegion';

export interface HeightSmoothOptions {
  radius: number;
  worldSize: number;
  strength: number;
  /** Box blur radius in grid cells (1 = 3×3). */
  blurRadiusCells?: number;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

let aabbScratch: Float32Array | null = null;
let passScratch: Float32Array | null = null;

function scratchPair(length: number): { src: Float32Array; tmp: Float32Array } {
  if (!aabbScratch || aabbScratch.length < length) {
    aabbScratch = new Float32Array(length);
    passScratch = new Float32Array(length);
  }
  return { src: aabbScratch, tmp: passScratch! };
}

function separableBoxBlur(
  src: Float32Array,
  tmp: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  const diam = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) {
        const xi = Math.max(0, Math.min(width - 1, x + d));
        sum += src[row + xi]!;
      }
      tmp[row + x] = sum / diam;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) {
        const yj = Math.max(0, Math.min(height - 1, y + d));
        sum += tmp[yj * width + x]!;
      }
      src[y * width + x] = sum / diam;
    }
  }
}

/** Weighted box blur inside brush disc (soften). */
export function smoothHeightInDisc(
  height: Float32Array,
  grids: MapGrids,
  centerX: number,
  centerZ: number,
  options: HeightSmoothOptions,
): void {
  const { radius, worldSize, strength, blurRadiusCells = 2 } = options;
  const size = grids.size;
  const layout = discGridLayout(centerX, centerZ, radius, worldSize, size);
  const padded = expandDirtyRegion(layout.bounds, blurRadiusCells, size);
  const width = padded.iMax - padded.iMin + 1;
  const heightCells = padded.jMax - padded.jMin + 1;
  const { src, tmp } = scratchPair(width * heightCells);

  for (let j = padded.jMin; j <= padded.jMax; j++) {
    const srcRow = j * size;
    const dstRow = (j - padded.jMin) * width;
    for (let i = padded.iMin; i <= padded.iMax; i++) {
      src[dstRow + (i - padded.iMin)] = height[srcRow + i]!;
    }
  }

  separableBoxBlur(src, tmp, width, heightCells, blurRadiusCells);

  forEachCellInDisc(grids, centerX, centerZ, { radius, worldSize }, (i, j, idx, falloff) => {
    const local = (j - padded.jMin) * width + (i - padded.iMin);
    const blurred = src[local]!;
    const blend = strength * falloff;
    height[idx] = clampUnit(height[idx]! * (1 - blend) + blurred * blend);
  });
}
