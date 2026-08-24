// src/map/authoring/importExrMap.ts — resample/remap EXR height + classify diffuse into MapGrids
import { PHASE0 } from '../../config/phase0.ts';
import { editor as editorVisual } from '../../config/visual/editor.ts';
import { WORLD } from '../../config/world.ts';
import type { MapGrids } from '../MapGrids.ts';
import { BiomeId, type MapEntity, type MapTerrainShape, mapGridSize } from '../MapTypes.ts';
import type { DecodedExrImage } from './decodeExrScanline.ts';

export interface ImportExrMapOptions {
  height: DecodedExrImage;
  diffuse?: DecodedExrImage;
  flipY?: boolean;
  /** Optional power curve after min-max remap. 1 = linear. */
  gamma?: number;
}

export interface ImportedExrMap {
  grids: MapGrids;
  entities: MapEntity[];
  terrainShape: MapTerrainShape;
}

function sampleBilinear(
  src: Float32Array,
  srcW: number,
  srcH: number,
  u: number,
  v: number,
): number {
  const x = u * (srcW - 1);
  const y = v * (srcH - 1);
  const i0 = Math.min(srcW - 1, Math.max(0, Math.floor(x)));
  const j0 = Math.min(srcH - 1, Math.max(0, Math.floor(y)));
  const i1 = Math.min(srcW - 1, i0 + 1);
  const j1 = Math.min(srcH - 1, j0 + 1);
  const tx = x - i0;
  const ty = y - j0;
  const h00 = src[j0 * srcW + i0]!;
  const h10 = src[j0 * srcW + i1]!;
  const h01 = src[j1 * srcW + i0]!;
  const h11 = src[j1 * srcW + i1]!;
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
}

function resampleChannel(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstSize: number,
  flipY: boolean,
): Float32Array {
  const dst = new Float32Array(dstSize * dstSize);
  const max = dstSize - 1;
  for (let j = 0; j < dstSize; j++) {
    const vRaw = max === 0 ? 0 : j / max;
    const v = flipY ? 1 - vRaw : vRaw;
    for (let i = 0; i < dstSize; i++) {
      const u = max === 0 ? 0 : i / max;
      dst[j * dstSize + i] = sampleBilinear(src, srcW, srcH, u, v);
    }
  }
  return dst;
}

function remapHeight01(height: Float32Array, gamma: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < height.length; i++) {
    const h = height[i]!;
    if (!Number.isFinite(h)) continue;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    height.fill(0);
    return { min: 0, max: 0 };
  }
  const range = max - min;
  const invGamma = 1 / Math.max(0.01, gamma);
  for (let i = 0; i < height.length; i++) {
    const t = Math.max(0, Math.min(1, (height[i]! - min) / range));
    height[i] = invGamma === 1 ? t : t ** invGamma;
  }
  return { min, max };
}

function classifyCell(
  heightNorm: number,
  slope: number,
  r: number,
  g: number,
  b: number,
): (typeof BiomeId)[keyof typeof BiomeId] {
  const waterish = b > r + 0.03 && b >= g * 0.9;
  const greenish = g > r + 0.02 && g > b;
  if (waterish && heightNorm < 0.2) return BiomeId.Water;
  if (heightNorm < WORLD.BIOMES.WATER.max) {
    return waterish ? BiomeId.Water : BiomeId.Shore;
  }
  if (slope > 0.85 || heightNorm > 0.72) return BiomeId.Mountain;
  if (heightNorm > WORLD.BIOMES.SHORE.max) return BiomeId.Hills;
  if (greenish && heightNorm > 0.12 && heightNorm < 0.36) return BiomeId.Meadow;
  if (heightNorm < 0.22) return BiomeId.Shore;
  return BiomeId.Forest;
}

function fillBiomes(
  grids: MapGrids,
  diffuse: { r: Float32Array; g: Float32Array; b: Float32Array } | null,
  cellSize: number,
): void {
  const { size, height, biome } = grids;
  const hScale = WORLD.HEIGHT_SCALE;
  for (let j = 0; j < size; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(size - 1, j + 1);
    for (let i = 0; i < size; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(size - 1, i + 1);
      const idx = j * size + i;
      const dhdx =
        ((height[j * size + i1]! - height[j * size + i0]!) * hScale) / ((i1 - i0) * cellSize);
      const dhdz =
        ((height[j1 * size + i]! - height[j0 * size + i]!) * hScale) / ((j1 - j0) * cellSize);
      const slope = Math.hypot(dhdx, dhdz);
      const r = diffuse ? diffuse.r[idx]! : 0.35;
      const g = diffuse ? diffuse.g[idx]! : 0.38;
      const b = diffuse ? diffuse.b[idx]! : 0.3;
      biome[idx] = classifyCell(height[idx]!, slope, r, g, b);
    }
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

function pickPlayerStart(grids: MapGrids): MapEntity {
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
        if (height[idx]! > 0.7) continue;
        const { x, z } = gridToWorld(i, j, size, WORLD.SIZE);
        return { type: 'playerStart', x, z, rotY: PHASE0.CAMERA.INITIAL_YAW };
      }
    }
  }
  return { type: 'playerStart', x: 0, z: 0, rotY: PHASE0.CAMERA.INITIAL_YAW };
}

/** Build 2049-cell grids from decoded EXR images. */
export function importExrMap(options: ImportExrMapOptions): ImportedExrMap {
  const dstSize = mapGridSize();
  const flipY = options.flipY === true;
  const gamma = options.gamma ?? 1;
  const count = dstSize * dstSize;
  const grids: MapGrids = {
    size: dstSize,
    height: new Float32Array(count),
    biome: new Uint8Array(count),
  };

  const height = resampleChannel(
    options.height.y,
    options.height.width,
    options.height.height,
    dstSize,
    flipY,
  );
  remapHeight01(height, gamma);
  grids.height.set(height);

  let diffuse: { r: Float32Array; g: Float32Array; b: Float32Array } | null = null;
  if (options.diffuse?.g && options.diffuse.b) {
    diffuse = {
      r: resampleChannel(
        options.diffuse.y,
        options.diffuse.width,
        options.diffuse.height,
        dstSize,
        flipY,
      ),
      g: resampleChannel(
        options.diffuse.g,
        options.diffuse.width,
        options.diffuse.height,
        dstSize,
        flipY,
      ),
      b: resampleChannel(
        options.diffuse.b,
        options.diffuse.width,
        options.diffuse.height,
        dstSize,
        flipY,
      ),
    };
  }

  const cellSize = WORLD.SIZE / Math.max(1, dstSize - 1);
  fillBiomes(grids, diffuse, cellSize);

  const terrainShape: MapTerrainShape = {
    ...editorVisual.terrainShape,
    talusPasses: 0,
  };

  return {
    grids,
    entities: [pickPlayerStart(grids)],
    terrainShape,
  };
}
