// src/world/WorldBuilder.ts — terrain, map props, landmarks, orbs from authored map
import type { DirectionalLight, InstancedMesh, Scene, Texture } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { initOrbSystem, type OrbSystemContext } from '../entities/EnergyOrb';
import { mapFileToGrids } from '../map/MapIO';
import type { MapFile } from '../map/MapTypes';
import type { WorldTerrain } from './disposeWorldTerrain';
import { setLandmarkLayout } from './LandmarkProximity';
import { buildMapTerrain } from './MapTerrainBuilder';
import { spawnMapEntities } from './map/MapEntitySpawner';
import { buildLandmarkLayoutFromMap } from './map/mapLandmarkLayout';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import type { GrassSystem } from './grass/GrassSystem';

export interface BuildWorldOptions {
  map: MapFile;
}

export interface WorldContext {
  terrain: WorldTerrain;
  mapId: string;
  /** Map-authored prop InstancedMeshes (render debug / shadow diagnostics). */
  debugInstancedMeshes: InstancedMesh[];
  orbSystem: OrbSystemContext;
  /** Disposes the landmark + mountain border roots (geometry + materials). */
  disposeLandmarks: () => void;
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
  });

  setLandmarkLayout(buildLandmarkLayoutFromMap(map));

  const spawned = spawnMapEntities(scene, assets, terrain, map);
  const disposeLandmarks = () => spawned.dispose();

  const orbSystem = initOrbSystem(scene, terrain, {
    placements: spawned.orbPlacements,
  });

  return {
    terrain,
    mapId: map.id,
    debugInstancedMeshes: spawned.debugInstancedMeshes,
    orbSystem,
    disposeLandmarks,
  };
}
