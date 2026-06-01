// src/world/disposeWorldTerrain.ts
import { disposeMapTerrain, type MapTerrainContext } from './MapTerrainBuilder';

export type WorldTerrain = MapTerrainContext;

export function disposeWorldTerrain(terrain: WorldTerrain): void {
  disposeMapTerrain(terrain);
}
