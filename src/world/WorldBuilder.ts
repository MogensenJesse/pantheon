// src/world/WorldBuilder.ts — terrain, scatter, landmarks, orbs
import type { Scene, DirectionalLight } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { buildAssetScatterer, type AssetScatterer } from './AssetScatterer';
import { buildLandmarkSpawner, buildMountainBorder } from './LandmarkSpawner';
import { initOrbSystem, type OrbSystemContext } from '../entities/EnergyOrb';
import { buildTerrain, type TerrainContext } from './TerrainGenerator';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';

export interface WorldContext {
  terrain: TerrainContext;
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
): WorldContext {
  const terrain = buildTerrain(scene, terrainTextures, sun);
  const scatterer = buildAssetScatterer(scene, assets, terrain);
  const landmarks = buildLandmarkSpawner(scene, assets, terrain);
  const mountains = buildMountainBorder(scene, assets, terrain);
  const orbSystem = initOrbSystem(scene, terrain);
  return {
    terrain,
    scatterer,
    orbSystem,
    disposeLandmarks: () => {
      landmarks.dispose();
      mountains.dispose();
    },
  };
}
