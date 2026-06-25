// src/world/WorldBuilder.ts — terrain, map props, orbs from authored map
import type { DirectionalLight, InstancedMesh, Scene, Texture } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { initOrbSystem, type OrbSystemContext } from '../entities/EnergyOrb';
import { mapFileToGrids } from '../map/MapIO';
import type { MapFile } from '../map/MapTypes';
import type { WorldTerrain } from './disposeWorldTerrain';
import type { GrassSystem } from './grass/core/GrassSystem';
import { buildMapTerrain } from './MapTerrainBuilder';
import { spawnMapEntities } from './map/MapEntitySpawner';
import type { TerrainTextureSet } from './terrain';

export interface BuildWorldOptions {
  map: MapFile;
}

export interface WorldContext {
  terrain: WorldTerrain;
  mapId: string;
  /** Map-authored prop InstancedMeshes (render debug / shadow diagnostics). */
  debugInstancedMeshes: InstancedMesh[];
  orbSystem: OrbSystemContext;
  disposeMapEntities: () => void;
  grassSystem?: GrassSystem;
}

export async function buildWorld(
  scene: Scene,
  assets: AssetRegistry,
  terrainTextures: TerrainTextureSet,
  sun: DirectionalLight,
  waterNormals: Texture,
  options: BuildWorldOptions,
): Promise<WorldContext> {
  const { map } = options;

  const terrain = buildMapTerrain(scene, terrainTextures, sun, mapFileToGrids(map), {
    waterNormals,
    lod: true,
  });

  const spawned = spawnMapEntities(scene, sun, assets, terrain, map);

  const orbSystem = initOrbSystem(scene, terrain, {
    placements: spawned.orbPlacements,
  });

  return {
    terrain,
    mapId: map.id,
    debugInstancedMeshes: spawned.debugInstancedMeshes,
    orbSystem,
    disposeMapEntities: () => spawned.dispose(),
  };
}
