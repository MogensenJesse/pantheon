// src/world/terrain/loadTerrainTextures.ts
import {
  Color,
  DataTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import { packOrmTexture } from './packOrmTexture';
import {
  TERRAIN_MAP_KINDS,
  TERRAIN_TEXTURE_BIOMES,
  TERRAIN_TEXTURE_EXTENSIONS,
  type TerrainMapKind,
  type TerrainTextureBiome,
  groundCoverColorUrl,
  terrainMetalnessUrl,
  terrainTextureUrl,
} from './terrainTextureManifest';

/** ORM packed texture: R = roughness, G = AO, B = metalness. */
export interface TerrainBiomeMaps {
  color: Texture;
  normal: Texture;
  orm: Texture;
  displacement: Texture;
}

export interface GroundCoverMaps {
  color: Texture;
}

export interface TerrainTextureSet {
  shore: TerrainBiomeMaps;
  forest: TerrainBiomeMaps;
  hills: TerrainBiomeMaps;
  rock: TerrainBiomeMaps;
  path: TerrainBiomeMaps;
  /** Tileable forest-floor overlay (`public/textures/terrain/ground_cover.jpg`). */
  groundCover: GroundCoverMaps;
  dispose: () => void;
}

const FALLBACK_COLORS: Record<TerrainTextureBiome, number> = {
  shore: 0x8a9a5b,
  forest: 0x2d7020,
  hills: 0x8c6c35,
  rock: 0xa09080,
  path: 0x8a7658,
};

function configureColorTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}

function configureDataTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}

function createFallbackColor(hex: number): DataTexture {
  const color = new Color(hex);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const tex = new DataTexture(data, 1, 1);
  configureColorTexture(tex);
  return tex;
}

function createFallbackNormal(): DataTexture {
  const data = new Uint8Array([128, 128, 255, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

function createFallbackOrm(): DataTexture {
  const data = new Uint8Array([128, 255, 0, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

function createFallbackScalar(value: number): DataTexture {
  const v = Math.round(value * 255);
  const data = new Uint8Array([v, v, v, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

async function loadMap(
  loader: TextureLoader,
  biome: TerrainTextureBiome,
  kind: TerrainMapKind,
): Promise<{ texture: Texture; usedFallback: boolean }> {
  const tried: string[] = [];
  for (const ext of TERRAIN_TEXTURE_EXTENSIONS) {
    const url = terrainTextureUrl(biome, kind, ext);
    tried.push(url);
    try {
      const texture = await loader.loadAsync(url);
      if (kind === 'color') configureColorTexture(texture);
      else configureDataTexture(texture);
      return { texture, usedFallback: false };
    } catch {
      // try next extension
    }
  }

  console.warn(`[terrain] Missing ${biome} ${kind}. Tried:\n  ${tried.join('\n  ')}`);
  let fallback: DataTexture;
  if (kind === 'color') fallback = createFallbackColor(FALLBACK_COLORS[biome]);
  else if (kind === 'normal') fallback = createFallbackNormal();
  else if (kind === 'displacement') fallback = createFallbackScalar(0);
  else fallback = createFallbackScalar(0.5);
  return { texture: fallback, usedFallback: true };
}

async function loadRockMetalness(loader: TextureLoader): Promise<Texture | undefined> {
  for (const ext of TERRAIN_TEXTURE_EXTENSIONS) {
    try {
      const texture = await loader.loadAsync(terrainMetalnessUrl(ext));
      configureDataTexture(texture);
      return texture;
    } catch {
      // try next
    }
  }
  return undefined;
}

async function loadBiomeMaps(
  loader: TextureLoader,
  biome: TerrainTextureBiome,
): Promise<TerrainBiomeMaps> {
  const entries = await Promise.all(
    TERRAIN_MAP_KINDS.map((kind) => loadMap(loader, biome, kind)),
  );
  const maps = Object.fromEntries(
    TERRAIN_MAP_KINDS.map((kind, i) => [kind, entries[i].texture]),
  ) as Record<TerrainMapKind, Texture>;

  const metal =
    biome === 'rock' ? await loadRockMetalness(loader) : undefined;

  const roughEntry = entries[TERRAIN_MAP_KINDS.indexOf('roughness')];
  const aoEntry = entries[TERRAIN_MAP_KINDS.indexOf('ao')];

  let orm: Texture;
  if (roughEntry.usedFallback || aoEntry.usedFallback) {
    maps.roughness.dispose();
    maps.ao.dispose();
    metal?.dispose();
    orm = createFallbackOrm();
    configureDataTexture(orm);
  } else {
    orm = packOrmTexture(maps.roughness, maps.ao, metal);
    configureDataTexture(orm);
  }

  return {
    color: maps.color,
    normal: maps.normal,
    orm,
    displacement: maps.displacement,
  };
}

async function loadGroundCoverColor(loader: TextureLoader): Promise<Texture> {
  const tried: string[] = [];
  for (const ext of TERRAIN_TEXTURE_EXTENSIONS) {
    const url = groundCoverColorUrl(ext);
    tried.push(url);
    try {
      const texture = await loader.loadAsync(url);
      configureColorTexture(texture);
      if (import.meta.env.DEV) {
        console.info('[terrain] ground_cover loaded', url);
      }
      return texture;
    } catch {
      // try next extension
    }
  }
  console.warn(`[terrain] Missing ground_cover color. Tried:\n  ${tried.join('\n  ')}`);
  return createFallbackColor(0x3d5c28);
}

async function loadGroundCoverMaps(loader: TextureLoader): Promise<GroundCoverMaps> {
  return { color: await loadGroundCoverColor(loader) };
}

export async function loadTerrainTextures(): Promise<TerrainTextureSet> {
  const loader = new TextureLoader();
  const [biomes, groundCover] = await Promise.all([
    Promise.all(
      TERRAIN_TEXTURE_BIOMES.map(async (biome) => [biome, await loadBiomeMaps(loader, biome)] as const),
    ),
    loadGroundCoverMaps(loader),
  ]);

  const set = Object.fromEntries(biomes) as Record<TerrainTextureBiome, TerrainBiomeMaps>;

  return {
    shore: set.shore,
    forest: set.forest,
    hills: set.hills,
    rock: set.rock,
    path: set.path,
    groundCover,
    dispose() {
      groundCover.color.dispose();
      for (const [, maps] of biomes) {
        maps.color.dispose();
        maps.normal.dispose();
        maps.orm.dispose();
        maps.displacement.dispose();
      }
    },
  };
}
