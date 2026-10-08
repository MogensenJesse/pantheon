// src/map/terrainAux.ts — authored convex ridge grid (one byte per cell, 0 = flat) and its map metadata

import type { MapTerrainAuxMeta } from './MapTypes.ts';

export function createConvexGrid(size: number): Uint8Array {
  return new Uint8Array(size * size);
}

/** Store a 0..1 convex value at grid cell `idx`. */
export function writeConvexCell(convex: Uint8Array, idx: number, value: number): void {
  convex[idx] = Math.round(Math.max(0, Math.min(1, value)) * 255);
}

export function defaultTerrainAuxMeta(): MapTerrainAuxMeta {
  return { hasConvex: false, stale: false };
}
