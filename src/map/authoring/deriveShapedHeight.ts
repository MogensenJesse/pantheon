// src/map/authoring/deriveShapedHeight.ts — sculpt base × Quilez → valley/sea/scale → talus → display height

import { WORLD } from '../../config/world';
import type { MapTerrainShape } from '../MapTypes';
import type { GridDirtyRegion } from './gridDirtyRegion';
import { createQuilezHeightSampler } from './quilezHeightField';
import { thermalErodeHeightGrid } from './thermalErode';

export interface DeriveShapedHeightOptions {
  worldSize: number;
  heightScaleWorld?: number;
  /** Stable Quilez PRNG seed (e.g. hash of map id). */
  noiseSeed: number;
  shape: MapTerrainShape;
  /**
   * Precomputed Quilez field (same length as height). When omitted, sampled inline
   * (slow — prefer {@link QuilezFieldCache} for interactive sculpt).
   */
  quilezField?: Float32Array;
  /** Skip thermal talus (fast preview while brushing). */
  skipTalus?: boolean;
  /** When set, only these cells are written (implies skipTalus). */
  region?: GridDirtyRegion;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function gridCellToWorldXZ(
  i: number,
  j: number,
  size: number,
  worldSize: number,
): { x: number; z: number } {
  const max = Math.max(1, size - 1);
  const u = (i + 0.5) / max;
  const v = (j + 0.5) / max;
  return {
    x: (u - 0.5) * worldSize,
    z: (v - 0.5) * worldSize,
  };
}

/** Map sandbox heightScale (20–200, default 100) onto a ~0.2–2 amplify. */
function heightScaleToNorm(heightScale: number): number {
  return Math.max(0.05, heightScale / 100);
}

/** Stable uint seed from map id (FNV-1a). */
function hashMapIdToSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

/** Resolve Quilez PRNG seed from shape (falls back to map-id hash). */
export function resolveTerrainNoiseSeed(shape: { seed?: number }, mapId: string): number {
  const raw = shape.seed;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw)) || 1;
  }
  return hashMapIdToSeed(mapId);
}

/** Params that affect the Quilez noise field (not post envelope curves / talus). */
function quilezCacheKey(
  gridSize: number,
  worldSize: number,
  noiseSeed: number,
  shape: Pick<MapTerrainShape, 'frequency' | 'octaves' | 'erosion' | 'warp'>,
): string {
  return [
    gridSize,
    worldSize,
    noiseSeed,
    shape.frequency,
    Math.floor(shape.octaves),
    shape.erosion,
    shape.warp,
  ].join('|');
}

/** Bake Quilez 0…1 samples for every grid cell (expensive — cache across brush stamps). */
function bakeQuilezField(
  gridSize: number,
  worldSize: number,
  noiseSeed: number,
  shape: Pick<MapTerrainShape, 'frequency' | 'octaves' | 'erosion' | 'warp'>,
  out?: Float32Array,
): Float32Array {
  const N = gridSize;
  const len = N * N;
  const field = out && out.length >= len ? out : new Float32Array(len);
  const sampleQ = createQuilezHeightSampler({
    seed: noiseSeed,
    frequency: shape.frequency,
    octaves: Math.max(1, Math.floor(shape.octaves)),
    lacunarity: 1.97,
    gain: 0.5,
    erosion: shape.erosion,
    warp: shape.warp,
    valleyBias: 1,
  });

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const { x, z } = gridCellToWorldXZ(i, j, N, worldSize);
      field[j * N + i] = sampleQ(x, z);
    }
  }
  return field;
}

/** Session-owned cache so brush flushes do not re-sample Perlin. */
export class QuilezFieldCache {
  private field: Float32Array | null = null;
  private key = '';

  get(
    gridSize: number,
    worldSize: number,
    noiseSeed: number,
    shape: MapTerrainShape,
  ): Float32Array {
    const nextKey = quilezCacheKey(gridSize, worldSize, noiseSeed, shape);
    if (this.field && this.key === nextKey) return this.field;
    this.field = bakeQuilezField(gridSize, worldSize, noiseSeed, shape, this.field ?? undefined);
    this.key = nextKey;
    return this.field;
  }

  invalidate(): void {
    this.key = '';
  }
}

let talusMetersScratch: Float32Array | null = null;

function talusScratch(length: number): Float32Array {
  if (!talusMetersScratch || talusMetersScratch.length < length) {
    talusMetersScratch = new Float32Array(length);
  }
  return talusMetersScratch;
}

function applyEnvelopeCell(
  base: number,
  q: number,
  valleyBias: number,
  sea: number,
  seaDenom: number,
  scaleNorm: number,
): number {
  let h = base * q;
  h = clamp01(h) ** valleyBias;
  h = clamp01((h - sea) / seaDenom);
  return clamp01(h * scaleNorm);
}

/**
 * Approximate inverse of {@link applyEnvelopeCell} (no talus).
 * Used after display-height soften so later derives keep the softened envelope.
 */
function invertEnvelopeCell(
  height: number,
  q: number,
  valleyBias: number,
  sea: number,
  seaDenom: number,
  scaleNorm: number,
): number {
  const h01 = clamp01(height / Math.max(1e-5, scaleNorm));
  const u = clamp01(h01 * seaDenom + sea);
  const bq = u ** (1 / Math.max(0.01, valleyBias));
  return clamp01(bq / Math.max(1e-5, q));
}

/** Write sculptBase so envelope(base × q) ≈ height (region or full grid). */
export function bakeSculptBaseFromHeight(
  height: Float32Array,
  sculptBase: Float32Array,
  quilezField: Float32Array,
  gridSize: number,
  shape: MapTerrainShape,
  region?: GridDirtyRegion,
): void {
  const N = gridSize;
  const sea = Math.max(0, Math.min(0.99, shape.seaLevel));
  const seaDenom = Math.max(1e-5, 1 - sea);
  const scaleNorm = heightScaleToNorm(shape.heightScale);
  const valleyBias = Math.max(0.01, shape.valleyBias);

  const writeCell = (idx: number) => {
    sculptBase[idx] = invertEnvelopeCell(
      height[idx]!,
      quilezField[idx]!,
      valleyBias,
      sea,
      seaDenom,
      scaleNorm,
    );
  };

  if (region) {
    const i0 = Math.max(0, region.iMin);
    const i1 = Math.min(N - 1, region.iMax);
    const j0 = Math.max(0, region.jMin);
    const j1 = Math.min(N - 1, region.jMax);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        writeCell(j * N + i);
      }
    }
    return;
  }

  const len = N * N;
  for (let idx = 0; idx < len; idx++) writeCell(idx);
}

/**
 * Derive display heights from sculpt base envelope × Quilez ridges, then valley/sea/scale/talus.
 * Writes into `outHeight` (typically `grids.height`).
 */
export function deriveShapedHeight(
  sculptBase: Float32Array,
  outHeight: Float32Array,
  gridSize: number,
  options: DeriveShapedHeightOptions,
): void {
  const { worldSize, noiseSeed, shape, region } = options;
  const heightScaleWorld = options.heightScaleWorld ?? WORLD.HEIGHT_SCALE;
  const N = gridSize;
  const len = N * N;
  if (sculptBase.length < len || outHeight.length < len) {
    throw new Error('deriveShapedHeight: buffer length mismatch');
  }

  const quilezField = options.quilezField ?? bakeQuilezField(N, worldSize, noiseSeed, shape);

  const sea = Math.max(0, Math.min(0.99, shape.seaLevel));
  const seaDenom = Math.max(1e-5, 1 - sea);
  const scaleNorm = heightScaleToNorm(shape.heightScale);
  const valleyBias = Math.max(0.01, shape.valleyBias);
  const skipTalus = options.skipTalus === true || region !== undefined;

  if (region) {
    const i0 = Math.max(0, region.iMin);
    const i1 = Math.min(N - 1, region.iMax);
    const j0 = Math.max(0, region.jMin);
    const j1 = Math.min(N - 1, region.jMax);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * N + i;
        outHeight[idx] = applyEnvelopeCell(
          sculptBase[idx]!,
          quilezField[idx]!,
          valleyBias,
          sea,
          seaDenom,
          scaleNorm,
        );
      }
    }
    return;
  }

  for (let idx = 0; idx < len; idx++) {
    outHeight[idx] = applyEnvelopeCell(
      sculptBase[idx]!,
      quilezField[idx]!,
      valleyBias,
      sea,
      seaDenom,
      scaleNorm,
    );
  }

  if (!skipTalus && shape.talusPasses > 0) {
    const cellSize = worldSize / Math.max(1, N - 1);
    const meters = talusScratch(len);
    for (let k = 0; k < len; k++) {
      meters[k] = outHeight[k]! * heightScaleWorld;
    }
    thermalErodeHeightGrid(
      meters,
      N,
      cellSize,
      shape.talus,
      Math.max(0, Math.floor(shape.talusPasses)),
    );
    for (let k = 0; k < len; k++) {
      outHeight[k] = clamp01(meters[k]! / heightScaleWorld);
    }
  }
}
