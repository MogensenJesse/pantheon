// src/world/WorldBuilder.ts — terrain, scatter, landmarks, orbs from authored map
import type { DirectionalLight, Scene, Texture } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { VISUAL } from '../config/visualTuning';
import { devSettings } from '../core/GameState';
import { initOrbSystem, type OrbSystemContext } from '../entities/EnergyOrb';
import { mapFileToGrids } from '../map/MapIO';
import type { MapFile } from '../map/MapTypes';
import { type AssetScatterer, buildAssetScatterer } from './AssetScatterer';
import type { WorldTerrain } from './disposeWorldTerrain';
import { setLandmarkLayout } from './LandmarkProximity';
import { applyMapClearance } from './landmarkClearance';
import { buildMapTerrain } from './MapTerrainBuilder';
import { spawnMapEntities } from './map/MapEntitySpawner';
import { buildLandmarkLayoutFromMap } from './map/mapLandmarkLayout';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';

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

  applyMapClearance(map);
  setLandmarkLayout(buildLandmarkLayoutFromMap(map));

  const grassEnabled = map.grass?.enabled !== false;
  devSettings.grass.densityMul = map.grass?.densityMul ?? VISUAL.grass.densityMul;

  const spawned = spawnMapEntities(scene, assets, terrain, map);
  const disposeLandmarks = () => spawned.dispose();

  const scatterer = await buildAssetScatterer(scene, assets, terrain, {
    scatterProps: false,
    scatterGrass: grassEnabled,
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
