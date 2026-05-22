// src/world/terrain/terrainTextureManifest.ts — expected ground texture assets (public/)

/** Base URL path served from `public/textures/terrain/`. */
export const TERRAIN_TEXTURE_BASE = '/textures/terrain/';

export const TERRAIN_TEXTURE_BIOMES = ['shore', 'forest', 'hills', 'rock', 'path'] as const;
export type TerrainTextureBiome = (typeof TERRAIN_TEXTURE_BIOMES)[number];

export const TERRAIN_MAP_KINDS = [
  'color',
  'normal',
  'roughness',
  'ao',
  'displacement',
] as const;
export type TerrainMapKind = (typeof TERRAIN_MAP_KINDS)[number];

/** Filename suffix per map kind (color uses biome name only). */
export const TERRAIN_MAP_SUFFIX: Record<TerrainMapKind, string> = {
  color: '',
  normal: '_normal',
  roughness: '_roughness',
  ao: '_ao',
  displacement: '_displacement',
};

export const TERRAIN_TEXTURE_EXTENSIONS = ['jpg', 'png', 'webp'] as const;

export function terrainTextureFileName(biome: TerrainTextureBiome, kind: TerrainMapKind): string {
  return `${biome}${TERRAIN_MAP_SUFFIX[kind]}`;
}

export function terrainTextureUrl(
  biome: TerrainTextureBiome,
  kind: TerrainMapKind,
  ext: string,
): string {
  return `${TERRAIN_TEXTURE_BASE}${terrainTextureFileName(biome, kind)}.${ext}`;
}

export function terrainMetalnessUrl(ext: string): string {
  return `${TERRAIN_TEXTURE_BASE}rock_metalness.${ext}`;
}

export function expectedTerrainTexturePaths(): string[] {
  const paths: string[] = [];
  for (const biome of TERRAIN_TEXTURE_BIOMES) {
    for (const kind of TERRAIN_MAP_KINDS) {
      for (const ext of TERRAIN_TEXTURE_EXTENSIONS) {
        paths.push(terrainTextureUrl(biome, kind, ext));
      }
    }
  }
  for (const ext of TERRAIN_TEXTURE_EXTENSIONS) {
    paths.push(terrainMetalnessUrl(ext));
  }
  return paths;
}
