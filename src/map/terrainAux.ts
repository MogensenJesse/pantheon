// src/map/terrainAux.ts — packed RGBA8 convex sidecar (GPU upload is R8 `.r`)

import type { MapTerrainAuxMeta } from './MapTypes.ts';

export const TERRAIN_AUX_FLAT_U8 = 128;

export function createFlatTerrainAux(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    data[o] = TERRAIN_AUX_FLAT_U8;
    data[o + 1] = TERRAIN_AUX_FLAT_U8;
    data[o + 2] = 0;
    data[o + 3] = 0;
  }
  return data;
}

export function writeTerrainAuxCell(
  aux: Uint8Array,
  idx: number,
  sample: { convex?: number },
): void {
  const o = idx * 4;
  if (sample.convex !== undefined) {
    aux[o + 3] = Math.round(Math.max(0, Math.min(1, sample.convex)) * 255);
  }
}

export function defaultTerrainAuxMeta(): MapTerrainAuxMeta {
  return {
    hasSlope: false,
    hasConvex: false,
    hasNormal: false,
    stale: false,
  };
}
