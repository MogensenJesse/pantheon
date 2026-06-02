// src/world/grass/grassTileOffsets.ts — CPU mirror of tile-local blade offsets (LOD partition)
import { GRASS_CONFIG } from './grassConfig';
/** TSL-style hash for CPU/GPU parity on init offsets. */
export function grassHash(instanceIndex: number, seed: number): number {
  const x = Math.sin((instanceIndex + seed) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export interface GrassTileOffsets {
  x: Float32Array;
  z: Float32Array;
}

export function createGrassTileOffsets(instanceCount?: number): GrassTileOffsets {
  const bladesPerSide = Math.floor(GRASS_CONFIG.BLADES_PER_SIDE);
  const total = instanceCount ?? bladesPerSide * bladesPerSide;
  const tileSize = GRASS_CONFIG.TILE_SIZE;
  const spacing = tileSize / bladesPerSide;
  const halfTile = tileSize * 0.5;

  const x = new Float32Array(total);
  const z = new Float32Array(total);

  for (let index = 0; index < total; index++) {
    const col = index % bladesPerSide;
    const row = Math.floor(index / bladesPerSide);
    const randX = grassHash(index, 4321);
    const randZ = grassHash(index, 1234);
    x[index] = col * spacing - halfTile + randX * spacing * 0.5;
    z[index] = row * spacing - halfTile + randZ * spacing * 0.5;
  }

  return { x, z };
}

export function wrapGrassTileOffsets(
  offsets: GrassTileOffsets,
  deltaX: number,
  deltaZ: number,
  tileSize = GRASS_CONFIG.TILE_SIZE,
): void {
  const half = tileSize * 0.5;
  const n = offsets.x.length;
  for (let i = 0; i < n; i++) {
    let ox = offsets.x[i] - deltaX + half;
    ox = ((ox % tileSize) + tileSize) % tileSize - half;
    offsets.x[i] = ox;

    let oz = offsets.z[i] - deltaZ + half;
    oz = ((oz % tileSize) + tileSize) % tileSize - half;
    offsets.z[i] = oz;
  }
}
