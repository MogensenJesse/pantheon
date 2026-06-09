// src/world/terrain/terrainTextureManifest.ts — Poly Haven glTF terrain pack manifest

/** Base URL path served from `public/textures/terrain/`. */
export const TERRAIN_TEXTURE_BASE = '/textures/terrain/';

/** glTF filename per biome folder (Poly Haven 2K packs). */
export const TERRAIN_GLTF_PACKS = {
  shore: 'sand_03_2k.gltf',
  forest: 'forest_leaves_02_2k.gltf',
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

export function terrainGltfUrl(folder: TerrainGltfFolder): string {
  return `${TERRAIN_TEXTURE_BASE}${folder}/${TERRAIN_GLTF_PACKS[folder]}`;
}
