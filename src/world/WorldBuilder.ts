// src/world/WorldBuilder.ts — terrain, scatter, landmarks, orbs
import type { Scene, DirectionalLight, Texture } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { initOrbSystem, type OrbSystemContext } from '../entities/EnergyOrb';
import { mapFileToGrids } from '../map/MapIO';
import { isAuthoredGameplayLayout, type MapFile } from '../map/MapTypes';
import { buildAssetScatterer, type AssetScatterer } from './AssetScatterer';
import { buildLandmarkSpawner, buildMountainBorder } from './LandmarkSpawner';
import { applyMapClearance } from './landmarkClearance';
import { buildLandmarkLayoutFromMap } from './map/mapLandmarkLayout';
import { setLandmarkLayout } from './LandmarkProximity';
import { spawnMapEntities } from './map/MapEntitySpawner';
import { buildTerrain } from './TerrainGenerator';
import { buildMapTerrain } from './MapTerrainBuilder';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import type { WorldTerrain } from './disposeWorldTerrain';

export interface BuildWorldOptions {
  /** Authored height/biome map; skips procedural terrain and prop scatter. */
  map?: MapFile;
}

export interface WorldContext {
  terrain: WorldTerrain;
  /** Set when playing an authored map from public/maps/. */
  mapId?: string;
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
  options: BuildWorldOptions = {},
): WorldContext {
  const { map } = options;
  const authoredGameplay = map && isAuthoredGameplayLayout(map);

  const terrain = map
    ? buildMapTerrain(scene, terrainTextures, sun, mapFileToGrids(map), { waterNormals })
    : buildTerrain(scene, terrainTextures, sun, waterNormals);

  applyMapClearance(map);
  setLandmarkLayout(buildLandmarkLayoutFromMap(map));

  const grassEnabled = map?.grass?.enabled !== false;
  const grassDensityMul = map?.grass?.densityMul ?? 1;

  let disposeLandmarks = () => {};

  if (authoredGameplay && map) {
    const spawned = spawnMapEntities(scene, assets, terrain, map);
    disposeLandmarks = () => spawned.dispose();

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

  const scatterer = buildAssetScatterer(scene, assets, terrain, {
    scatterProps: !map,
    scatterGrass: !map || grassEnabled,
    grassDensityMul: map ? grassDensityMul : undefined,
  });

  const landmarks = buildLandmarkSpawner(scene, assets, terrain);
  const mountains = buildMountainBorder(scene, assets, terrain);
  const orbSystem = initOrbSystem(scene, terrain);

  disposeLandmarks = () => {
    landmarks.dispose();
    mountains.dispose();
  };

  return {
    terrain,
    mapId: map?.id,
    scatterer,
    orbSystem,
    disposeLandmarks,
  };
}
