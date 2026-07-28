// src/world/WorldBuilder.ts — terrain, map props, orbs from authored map
import type { DirectionalLight, InstancedMesh, Scene, Texture } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { initOrbSystem, type OrbSystemContext } from '../entities/EnergyOrb';
import { mapFileToGrids } from '../map/MapIO';
import type { MapFile } from '../map/MapTypes';
import type { GrassSystem } from './grass/core/GrassSystem';
import type { WorldTerrain } from './MapTerrainBuilder';
import { buildMapTerrain } from './MapTerrainBuilder';
import { spawnMapEntities } from './map/MapEntitySpawner';
import { initPropGroundContact } from './mapProps/config/propGroundContactUniforms';
import type { PropLodGroup } from './mapProps/mapPropLod';
import type { TerrainTextureSet } from './terrain';
import { WORLD } from './WorldConfig';

export interface BuildWorldOptions {
  map: MapFile;
}

export interface WorldContext {
  terrain: WorldTerrain;
  mapId: string;
  /** Map-authored prop InstancedMeshes (render debug / shadow diagnostics). */
  debugInstancedMeshes: InstancedMesh[];
  /** Distance-banded prop LOD groups (updated each frame from gameTick). */
  propLodGroups: PropLodGroup[];
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

  initPropGroundContact({
    heightMap: terrain.heightMap,
    worldSize: WORLD.SIZE,
    heightScale: WORLD.HEIGHT_SCALE,
  });

  const spawned = spawnMapEntities(scene, sun, assets, terrain, map);

  const orbSystem = initOrbSystem(scene, terrain, {
    placements: spawned.orbPlacements,
  });

  return {
    terrain,
    mapId: map.id,
    debugInstancedMeshes: spawned.debugInstancedMeshes,
    propLodGroups: spawned.propLodGroups,
    orbSystem,
    disposeMapEntities: () => spawned.dispose(),
  };
}
