// src/world/WorldBuilder.ts — terrain, scatter, landmarks, orbs from authored map
import type { Scene, DirectionalLight, Texture } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { initOrbSystem, type OrbSystemContext } from '../entities/EnergyOrb';
import { mapFileToGrids } from '../map/MapIO';
import type { MapFile } from '../map/MapTypes';
import { buildAssetScatterer, type AssetScatterer } from './AssetScatterer';
import { applyMapClearance } from './landmarkClearance';
import { buildLandmarkLayoutFromMap } from './map/mapLandmarkLayout';
import { setLandmarkLayout } from './LandmarkProximity';
import { spawnMapEntities } from './map/MapEntitySpawner';
import { buildMapTerrain } from './MapTerrainBuilder';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import type { WorldTerrain } from './disposeWorldTerrain';

export interface BuildWorldOptions {
  map: MapFile;
}

export interface WorldContext {
  terrain: WorldTerrain;
  mapId: string;
  scatterer: AssetScatterer;
  orbSystem: OrbSystemContext;
  /** Disposes the landmark + mountain border roots (geometry + materials). */
  disposeLandmarks: () => void;
}

export function buildWorld(
  scene: Scene,
  assets: AssetRegistry,
  terrainTextures: TerrainTextureSet,
  sun: DirectionalLight,
  waterNormals: Texture,
  options: BuildWorldOptions,
): WorldContext {
  const { map } = options;

  const terrain = buildMapTerrain(scene, terrainTextures, sun, mapFileToGrids(map), { waterNormals });

  applyMapClearance(map);
  setLandmarkLayout(buildLandmarkLayoutFromMap(map));

  const grassEnabled = map.grass?.enabled !== false;
  const grassDensityMul = map.grass?.densityMul ?? 1;

  const spawned = spawnMapEntities(scene, assets, terrain, map);
  const disposeLandmarks = () => spawned.dispose();

  const scatterer = buildAssetScatterer(scene, assets, terrain, {
    scatterProps: false,
    scatterGrass: grassEnabled,
    grassDensityMul,
  });

  const orbSystem = initOrbSystem(scene, terrain, {
    placements: spawned.orbPlacements,
  });

  return {
    terrain,
    mapId: map.id,
    scatterer,
    orbSystem,
    disposeLandmarks,
  };
}
