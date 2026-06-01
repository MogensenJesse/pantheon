// src/world/scatter/pathExclusion.ts — keep scatter off painted path biomes
import { isNearPaintedPath } from '../../map/MapGrids';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import type { TerrainContext } from '../TerrainGenerator';

export function isMapTerrain(terrain: TerrainContext): terrain is MapTerrainContext {
  return 'grids' in terrain;
}

export function tooCloseToPathExclusion(
  terrain: TerrainContext,
  x: number,
  z: number,
  radius: number,
): boolean {
  if (isMapTerrain(terrain)) {
    return isNearPaintedPath(terrain.grids, x, z, radius);
  }
  return false;
}
