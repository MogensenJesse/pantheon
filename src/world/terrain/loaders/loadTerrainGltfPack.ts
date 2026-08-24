// src/world/terrain/loaders/loadTerrainGltfPack.ts — parse Poly Haven glTF packs (JSON only, no mesh)
import {
  TERRAIN_GLTF_PACKS,
  TERRAIN_TEXTURE_BASE,
  type TerrainGltfFolder,
} from '../config/terrainTextureManifest';
import { TerrainPackLoadError } from './terrainLoadErrors';

const gltfPackUrlsCache = new Map<TerrainGltfFolder, Promise<GltfPackUrls | null>>();

interface GltfImage {
  uri?: string;
}

interface GltfTexture {
  source?: number;
}

interface GltfMaterial {
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number };
  };
}

interface GltfRoot {
  materials?: GltfMaterial[];
  textures?: GltfTexture[];
  images?: GltfImage[];
}

export interface GltfPackUrls {
  colorUrl: string;
}

function resolveImageUri(folder: TerrainGltfFolder, uri: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:')) {
    return uri;
  }
  const normalized = uri.replace(/^\.\//, '');
  return `${TERRAIN_TEXTURE_BASE}${folder}/${normalized}`;
}

function imageUriAt(
  root: GltfRoot,
  folder: TerrainGltfFolder,
  textureIndex: number | undefined,
): string | null {
  if (textureIndex === undefined) return null;
  const tex = root.textures?.[textureIndex];
  const source = tex?.source;
  if (source === undefined) return null;
  const uri = root.images?.[source]?.uri;
  if (!uri) return null;
  return resolveImageUri(folder, uri);
}

function parseGltfPackUrls(folder: TerrainGltfFolder, root: GltfRoot): GltfPackUrls | null {
  const material = root.materials?.[0];
  if (!material) return null;

  const colorUrl = imageUriAt(root, folder, material.pbrMetallicRoughness?.baseColorTexture?.index);
  if (!colorUrl) return null;
  return { colorUrl };
}

export async function fetchGltfPackUrls(folder: TerrainGltfFolder): Promise<GltfPackUrls | null> {
  let pending = gltfPackUrlsCache.get(folder);
  if (!pending) {
    pending = fetchGltfPackUrlsInner(folder);
    gltfPackUrlsCache.set(folder, pending);
  }
  return pending;
}

async function fetchGltfPackUrlsInner(folder: TerrainGltfFolder): Promise<GltfPackUrls | null> {
  const gltfFile = TERRAIN_GLTF_PACKS[folder];
  if (!gltfFile || gltfFile.startsWith('TBD')) {
    return null;
  }

  const url = `${TERRAIN_TEXTURE_BASE}${folder}/${gltfFile}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new TerrainPackLoadError(`Terrain glTF fetch failed (${folder}): ${url}`, { cause });
  }
  if (!res.ok) {
    throw new TerrainPackLoadError(
      `Terrain glTF fetch failed (${folder}): ${url} (${res.status} ${res.statusText})`,
    );
  }

  let root: GltfRoot;
  try {
    root = (await res.json()) as GltfRoot;
  } catch (cause) {
    throw new TerrainPackLoadError(`Terrain glTF parse failed (${folder}): ${url}`, { cause });
  }

  const urls = parseGltfPackUrls(folder, root);
  if (!urls) {
    throw new TerrainPackLoadError(
      `Terrain glTF pack missing required textures (${folder}): ${url}`,
    );
  }
  return urls;
}

/** Color map URL for editor thumbnails and UI. */
export async function resolveGltfPackColorUrl(folder: TerrainGltfFolder): Promise<string | null> {
  try {
    const urls = await fetchGltfPackUrls(folder);
    return urls?.colorUrl ?? null;
  } catch {
    return null;
  }
}
