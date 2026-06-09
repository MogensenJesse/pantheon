// src/world/terrain/loadTerrainGltfPack.ts — parse Poly Haven glTF packs (JSON only, no mesh)
import {
  TERRAIN_TEXTURE_BASE,
  TERRAIN_GLTF_PACKS,
  type TerrainGltfFolder,
} from './terrainTextureManifest';

interface GltfImage {
  uri?: string;
}

interface GltfTexture {
  source?: number;
}

interface GltfMaterial {
  normalTexture?: { index: number };
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
  };
}

interface GltfRoot {
  materials?: GltfMaterial[];
  textures?: GltfTexture[];
  images?: GltfImage[];
}

export type GltfMrKind = 'rough' | 'arm';

export interface GltfPackUrls {
  colorUrl: string;
  normalUrl: string;
  mrUrl: string;
  mrKind: GltfMrKind;
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

function detectMrKind(uri: string): GltfMrKind {
  return uri.toLowerCase().includes('_arm_') ? 'arm' : 'rough';
}

export function parseGltfPackUrls(folder: TerrainGltfFolder, root: GltfRoot): GltfPackUrls | null {
  const material = root.materials?.[0];
  if (!material) return null;

  const pbr = material.pbrMetallicRoughness;
  const colorUrl = imageUriAt(root, folder, pbr?.baseColorTexture?.index);
  const normalUrl = imageUriAt(root, folder, material.normalTexture?.index);
  const mrUrl = imageUriAt(root, folder, pbr?.metallicRoughnessTexture?.index);

  if (!colorUrl || !normalUrl || !mrUrl) return null;

  return {
    colorUrl,
    normalUrl,
    mrUrl,
    mrKind: detectMrKind(mrUrl),
  };
}

export async function fetchGltfPackUrls(folder: TerrainGltfFolder): Promise<GltfPackUrls | null> {
  const gltfFile = TERRAIN_GLTF_PACKS[folder];
  if (!gltfFile || gltfFile.startsWith('TBD')) {
    console.warn(`[terrain] No glTF pack registered for "${folder}"`);
    return null;
  }

  const url = `${TERRAIN_TEXTURE_BASE}${folder}/${gltfFile}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[terrain] Failed to fetch glTF pack: ${url} (${res.status})`);
      return null;
    }
    const root = (await res.json()) as GltfRoot;
    const urls = parseGltfPackUrls(folder, root);
    if (!urls) {
      console.warn(`[terrain] glTF pack missing PBR textures: ${url}`);
    }
    return urls;
  } catch (err) {
    console.warn(`[terrain] Failed to parse glTF pack: ${url}`, err);
    return null;
  }
}

/** Color map URL for editor thumbnails and UI. */
export async function resolveGltfPackColorUrl(folder: TerrainGltfFolder): Promise<string | null> {
  const urls = await fetchGltfPackUrls(folder);
  return urls?.colorUrl ?? null;
}
