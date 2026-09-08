// src/world/terrain/config/terrainTextureManifest.ts — biome folder names + optional glTF packs

import type { TerrainAtlasBiomeKey } from '../atlas/atlasConstants';

/** Base URL path served from `public/textures/terrain/`. */
export const TERRAIN_TEXTURE_BASE = '/textures/terrain/';

/** glTF filename per biome folder (legacy Poly Haven packs). Optional when loose PBR maps are present. */
export const TERRAIN_GLTF_PACKS = {
  shore: 'sand_03_2k.gltf',
  forest: 'forrest_ground_01_2k.gltf',
  hills: 'aerial_rocks_02_2k.gltf',
  mountain: 'rock_face_03_2k.gltf',
  path: 'grassy_cobblestone_2k.gltf',
  meadow: 'rocky_terrain_02_2k.gltf',
  snow: 'snow_02_2k.gltf',
  rock: 'dark_rock_02_1k.gltf',
  /** Loose PBR only (`desert_ground_01_*`); TBD skips glTF fetch. */
  water: 'TBD.gltf',
} as const satisfies Record<TerrainAtlasBiomeKey, string>;

export type TerrainGltfFolder = keyof typeof TERRAIN_GLTF_PACKS;

export const TERRAIN_SNOW_TEXTURE = 'snow' as const satisfies TerrainAtlasBiomeKey;

/** Non-snow atlas folders (paint + slope-rock). Play/editor pack uses `TERRAIN_ATLAS_BIOME_KEYS`. */
export type TerrainTextureBiome = Exclude<TerrainAtlasBiomeKey, typeof TERRAIN_SNOW_TEXTURE>;
