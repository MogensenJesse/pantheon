// src/world/disposeWorldTerrain.ts
import { disposeMapTerrain, type MapTerrainContext } from './MapTerrainBuilder';
import { disposeTerrain, type TerrainContext } from './TerrainGenerator';

export type WorldTerrain = TerrainContext | MapTerrainContext;

export function isAuthoredTerrain(terrain: WorldTerrain): terrain is MapTerrainContext {
  return 'grids' in terrain;
}

export function disposeWorldTerrain(terrain: WorldTerrain): void {
  if (isAuthoredTerrain(terrain)) disposeMapTerrain(terrain);
  else disposeTerrain(terrain);
}
