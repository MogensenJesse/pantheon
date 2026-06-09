// src/world/terrain/loadTerrainTextures.ts
import {
  Color,
  DataTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { fetchGltfPackUrls } from './loadTerrainGltfPack';
import { packArmToOrm, packRoughMrToOrm } from './packOrmTexture';
import { buildTerrainBiomeAtlases, type TerrainBiomeAtlases } from './terrainMapAtlas';
import {
  TERRAIN_SNOW_TEXTURE,
  TERRAIN_TEXTURE_BIOMES,
  type TerrainGltfFolder,
} from './terrainTextureManifest';

/** ORM packed texture: R = roughness, G = AO, B = metalness. */
export interface TerrainBiomeMaps {
  color: Texture;
  normal: Texture;
  orm: Texture;
  displacement: Texture;
}

export interface TerrainTextureSet {
  /** Color / normal / ORM atlases (7 biomes in a 3×3 grid). */
  atlases: TerrainBiomeAtlases;
  /** Neutral 1×1 — glTF packs omit displacement. */
  displacement: Texture;
  dispose: () => void;
}

const FALLBACK_COLORS: Record<TerrainGltfFolder, number> = {
  shore: 0x8a9a5b,
  forest: 0x2d7020,
  hills: 0x8c6c35,
  mountain: 0xa09080,
  path: 0x8a7658,
  meadow: 0x6a9a4b,
  snow: 0xe8eef5,
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

function createFallbackDisplacement(): DataTexture {
  const data = new Uint8Array([0, 0, 0, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

async function loadTexture(
  loader: TextureLoader,
  url: string,
  kind: 'color' | 'data',
): Promise<{ texture: Texture | null; usedFallback: boolean }> {
  try {
    const texture = await loader.loadAsync(url);
    if (kind === 'color') configureColorTexture(texture);
    else configureDataTexture(texture);
    return { texture, usedFallback: false };
  } catch {
    return { texture: null, usedFallback: true };
  }
}

async function loadBiomeMapsFromGltfPack(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
): Promise<TerrainBiomeMaps> {
  const pack = await fetchGltfPackUrls(folder);
  const fallbackHex = FALLBACK_COLORS[folder];

  if (!pack) {
    console.warn(`[terrain] Using fallbacks for "${folder}" (glTF pack unavailable)`);
    return {
      color: createFallbackColor(fallbackHex),
      normal: createFallbackNormal(),
      orm: createFallbackOrm(),
      displacement: createFallbackDisplacement(),
    };
  }

  const [colorEntry, normalEntry, mrEntry] = await Promise.all([
    loadTexture(loader, pack.colorUrl, 'color'),
    loadTexture(loader, pack.normalUrl, 'data'),
    loadTexture(loader, pack.mrUrl, 'data'),
  ]);

  const color = colorEntry.usedFallback || !colorEntry.texture
    ? createFallbackColor(fallbackHex)
    : colorEntry.texture;
  const normal = normalEntry.usedFallback || !normalEntry.texture
    ? createFallbackNormal()
    : normalEntry.texture;

  let orm: Texture;
  if (mrEntry.usedFallback || !mrEntry.texture) {
    orm = createFallbackOrm();
  } else {
    orm =
      pack.mrKind === 'arm'
        ? packArmToOrm(mrEntry.texture)
        : packRoughMrToOrm(mrEntry.texture);
    configureDataTexture(orm);
  }

  if (colorEntry.usedFallback) {
    console.warn(`[terrain] Missing color for ${folder}: ${pack.colorUrl}`);
  }
  if (normalEntry.usedFallback) {
    console.warn(`[terrain] Missing normal for ${folder}: ${pack.normalUrl}`);
  }
  if (mrEntry.usedFallback) {
    console.warn(`[terrain] Missing MR/ARM for ${folder}: ${pack.mrUrl}`);
  }

  return {
    color,
    normal,
    orm,
    displacement: createFallbackDisplacement(),
  };
}

export async function loadTerrainTextures(): Promise<TerrainTextureSet> {
  const loader = new TextureLoader();
  const biomeFolders = [...TERRAIN_TEXTURE_BIOMES, TERRAIN_SNOW_TEXTURE] as TerrainGltfFolder[];

  const entries = await Promise.all(
    biomeFolders.map(
      async (folder) => [folder, await loadBiomeMapsFromGltfPack(loader, folder)] as const,
    ),
  );

  const maps = entries.map(([, m]) => m);
  const atlases = buildTerrainBiomeAtlases({
    color: maps.map((m) => m.color),
    normal: maps.map((m) => m.normal),
    orm: maps.map((m) => m.orm),
  });

  const displacement = createFallbackDisplacement();
  for (const m of maps) {
    m.displacement.dispose();
  }

  return {
    atlases,
    displacement,
    dispose() {
      atlases.color.dispose();
      atlases.normal.dispose();
      atlases.orm.dispose();
      displacement.dispose();
    },
  };
}
