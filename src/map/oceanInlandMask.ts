// src/map/oceanInlandMask.ts — metres-from-ocean bake (map-edge flood; inland lakes stay inland)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
} from 'three';
import { WORLD } from '../config/world';
import type { MapGrids } from './MapGrids';

/**
 * R8 stores `min(1, distM / ENCODE)`. GPU: `sample.r * INLAND_DIST_ENCODE_M`.
 * Must stay ≥ `valleyInlandEndM` so the coastal fade has headroom without a rebake.
 */
export const INLAND_DIST_ENCODE_M = 512;

const INF_M = 1e6;

let scratchWet: Uint8Array | null = null;
let scratchDist: Float32Array | null = null;
let scratchQueue: Int32Array | null = null;

function applyMaskTextureDefaults(tex: DataTexture): void {
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
}

function ensureScratch(n: number): void {
  if (scratchDist && scratchDist.length >= n) return;
  scratchWet = new Uint8Array(n);
  scratchDist = new Float32Array(n);
  scratchQueue = new Int32Array(n);
}

/** 1×1 fully inland — `initValleyFog` runs before terrain exists. */
export function createPlaceholderInlandTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat, UnsignedByteType);
  applyMaskTextureDefaults(tex);
  tex.needsUpdate = true;
  return tex;
}

function encodeDistByte(distM: number): number {
  if (!(distM < INF_M * 0.5)) return 255;
  return Math.max(0, Math.min(255, Math.round((distM / INLAND_DIST_ENCODE_M) * 255)));
}

/**
 * Ocean = wet cells flood-filled from the map border. Inland lakes are wet but
 * not ocean-connected, so they get a large inland distance (stay misty).
 * No dry land (blank editor map): write full inland so fog preview still works.
 */
export function fillOceanInlandMaskData(
  data: Uint8Array,
  grids: MapGrids,
  waterLevelM: number,
): void {
  const { size, height } = grids;
  const n = size * size;
  const cellM = WORLD.SIZE / Math.max(1, size - 1);
  const ortho = cellM;
  const diag = cellM * Math.SQRT2;
  const hScale = WORLD.HEIGHT_SCALE;

  ensureScratch(n);
  const wet = scratchWet!;
  const dist = scratchDist!;
  const queue = scratchQueue!;

  let dryCount = 0;
  for (let i = 0; i < n; i++) {
    const y = height[i]! * hScale;
    if (y >= waterLevelM) {
      wet[i] = 0;
      dryCount++;
    } else {
      wet[i] = 1;
    }
  }

  if (dryCount === 0) {
    data.fill(255);
    return;
  }

  dist.fill(INF_M);
  let head = 0;
  let tail = 0;

  const enqueueOcean = (idx: number): void => {
    if (dist[idx] === 0) return;
    dist[idx] = 0;
    queue[tail++] = idx;
  };

  const tryBorder = (idx: number): void => {
    if (wet[idx]) enqueueOcean(idx);
  };

  for (let i = 0; i < size; i++) {
    tryBorder(i);
    tryBorder((size - 1) * size + i);
  }
  for (let j = 1; j < size - 1; j++) {
    tryBorder(j * size);
    tryBorder(j * size + size - 1);
  }

  while (head < tail) {
    const idx = queue[head++]!;
    const i = idx % size;
    const j = (idx / size) | 0;
    if (i > 0 && wet[idx - 1]) enqueueOcean(idx - 1);
    if (i < size - 1 && wet[idx + 1]) enqueueOcean(idx + 1);
    if (j > 0 && wet[idx - size]) enqueueOcean(idx - size);
    if (j < size - 1 && wet[idx + size]) enqueueOcean(idx + size);
  }

  // Two-pass 3×3 chamfer: Euclidean-ish metres to nearest ocean cell.
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      let d = dist[idx]!;
      if (i > 0) d = Math.min(d, dist[idx - 1]! + ortho);
      if (j > 0) d = Math.min(d, dist[idx - size]! + ortho);
      if (i > 0 && j > 0) d = Math.min(d, dist[idx - size - 1]! + diag);
      if (i < size - 1 && j > 0) d = Math.min(d, dist[idx - size + 1]! + diag);
      dist[idx] = d;
    }
  }
  for (let j = size - 1; j >= 0; j--) {
    for (let i = size - 1; i >= 0; i--) {
      const idx = j * size + i;
      let d = dist[idx]!;
      if (i < size - 1) d = Math.min(d, dist[idx + 1]! + ortho);
      if (j < size - 1) d = Math.min(d, dist[idx + size]! + ortho);
      if (i < size - 1 && j < size - 1) d = Math.min(d, dist[idx + size + 1]! + diag);
      if (i > 0 && j < size - 1) d = Math.min(d, dist[idx + size - 1]! + diag);
      dist[idx] = d;
    }
  }

  for (let i = 0; i < n; i++) {
    data[i] = encodeDistByte(dist[i]!);
  }
}

export function createOceanInlandMaskTexture(grids: MapGrids, waterLevelM: number): DataTexture {
  const n = grids.size * grids.size;
  const data = new Uint8Array(n);
  fillOceanInlandMaskData(data, grids, waterLevelM);
  const tex = new DataTexture(data, grids.size, grids.size, RedFormat, UnsignedByteType);
  applyMaskTextureDefaults(tex);
  tex.needsUpdate = true;
  return tex;
}

export function updateOceanInlandMaskTexture(
  tex: DataTexture,
  grids: MapGrids,
  waterLevelM: number,
): void {
  const data = tex.image.data as Uint8Array;
  if (data.length !== grids.size * grids.size) return;
  fillOceanInlandMaskData(data, grids, waterLevelM);
  tex.needsUpdate = true;
}
