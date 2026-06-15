// src/world/terrain/config/terrainTextureManifest.ts — Poly Haven glTF terrain pack manifest

/** Base URL path served from `public/textures/terrain/`. */
export const TERRAIN_TEXTURE_BASE = '/textures/terrain/';

/** glTF filename per biome folder (Poly Haven 2K packs). */
export const TERRAIN_GLTF_PACKS = {
  shore: 'sand_03_2k.gltf',
  forest: 'forrest_ground_01_2k.gltf',
  hills: 'aerial_rocks_02_2k.gltf',
  mountain: 'rock_face_03_2k.gltf',
  path: 'grassy_cobblestone_2k.gltf',
  meadow: 'rocky_terrain_02_2k.gltf',
  snow: 'snow_02_2k.gltf',
} as const;

export type TerrainGltfFolder = keyof typeof TERRAIN_GLTF_PACKS;

export const TERRAIN_TEXTURE_BIOMES = [
  'shore',
  'forest',
  'hills',
  'mountain',
  'path',
  'meadow',
] as const;
export type TerrainTextureBiome = (typeof TERRAIN_TEXTURE_BIOMES)[number];

export const TERRAIN_SNOW_TEXTURE = 'snow' as const;

/** Biomes with no vertex displacement — fully occluded (e.g. GPU grass over meadow). */
export const TERRAIN_SKIP_VERTEX_DISP_BIOMES: readonly TerrainGltfFolder[] = ['meadow'];
