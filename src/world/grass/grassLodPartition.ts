// src/world/grass/grassLodPartition.ts — Tier 3B: split grid instances into near / far LOD rings
import { GRASS_CONFIG } from './grassConfig';

export interface GrassLodPartition {
  nearIndices: Uint32Array;
  farIndices: Uint32Array;
}

/** Squared radius (m) in tile space: inside = LOD0, outside = LOD1 (see lod0Radius / fieldRadius). */
export function grassLodRadiusSq(): number {
  const r = GRASS_CONFIG.LOD_RADIUS;
  return r * r;
}

/**
 * Partition by cell-center grid (DEV trace only — does not follow tile wrap).
 * @deprecated Use partitionGrassLodByOffsets with live tile-local offsets.
 */
export function partitionGrassLodIndices(
  bladesPerSide: number,
  tileSize: number,
  radiusSq: number,
): GrassLodPartition {
  const spacing = tileSize / bladesPerSide;
  const halfTile = tileSize * 0.5;
  const near: number[] = [];
  const far: number[] = [];
  const total = bladesPerSide * bladesPerSide;

  for (let index = 0; index < total; index++) {
    const col = index % bladesPerSide;
    const row = Math.floor(index / bladesPerSide);
    const offsetX = (col + 0.5) * spacing - halfTile;
    const offsetZ = (row + 0.5) * spacing - halfTile;
    const distSq = offsetX * offsetX + offsetZ * offsetZ;
    if (distSq < radiusSq) near.push(index);
    else far.push(index);
  }

  return {
    nearIndices: Uint32Array.from(near),
    farIndices: Uint32Array.from(far),
  };
}

/** Player-centered LOD ring: |offset|² < radiusSq in tile space (player at origin). */
export function partitionGrassLodByOffsets(
  offsetsX: ArrayLike<number>,
  offsetsZ: ArrayLike<number>,
  radiusSq: number,
): GrassLodPartition {
  const near: number[] = [];
  const far: number[] = [];
  const total = offsetsX.length;

  for (let index = 0; index < total; index++) {
    const ox = offsetsX[index];
    const oz = offsetsZ[index];
    const distSq = ox * ox + oz * oz;
    if (distSq < radiusSq) near.push(index);
    else far.push(index);
  }

  return {
    nearIndices: Uint32Array.from(near),
    farIndices: Uint32Array.from(far),
  };
}
