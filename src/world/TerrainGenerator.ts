// src/world/TerrainGenerator.ts — terrain surface types shared by map terrain and systems
import type { Mesh, Object3D } from 'three';
import type { MapGrids } from '../map/MapGrids';
import type { BiomeIdValue } from '../map/MapTypes';
import type { TerrainSplatMaterial } from './terrain';

/** Height sampling + render meshes for authored map terrain. */
export interface TerrainSurface {
  mesh: Mesh;
  /** Reflective ocean (three.js WaterMesh) spanning the island disc. */
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
  /** Authored map biome grid (terrain splat + path paint). */
  grids?: MapGrids;
  getBiomeAt?: (x: number, z: number) => BiomeIdValue;
}

export type TerrainContext = TerrainSurface;
