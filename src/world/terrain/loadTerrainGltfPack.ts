// src/world/terrain/loadTerrainGltfPack.ts — parse Poly Haven glTF packs (JSON only, no mesh)
import { devSettings } from '../../core/GameState';
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
  extensions?: {
    KHR_materials_specular?: {
      specularTexture?: { index: number };
    };
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
  /** KHR_materials_specular specularTexture when present. */
  specUrl?: string;
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
  const specIndex = material.extensions?.KHR_materials_specular?.specularTexture?.index;
  const specUrl = specIndex !== undefined ? imageUriAt(root, folder, specIndex) : null;

  if (!colorUrl || !normalUrl || !mrUrl) return null;

  return {
    colorUrl,
    normalUrl,
    mrUrl,
    mrKind: detectMrKind(mrUrl),
    ...(specUrl ? { specUrl } : {}),
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

/** Derive Poly Haven material prefix from a glTF color map URI (e.g. `aerial_rocks_02`). */
export function deriveMaterialPrefix(colorUrl: string): string | null {
  const match = colorUrl.match(/([^/]+)_(?:diff|diffuse)_2k\.(?:jpg|jpeg|png)$/i);
  return match?.[1] ?? null;
}

const DISP_SUFFIXES = ['disp', 'displacement'] as const;
const DISP_EXTENSIONS = ['exr', 'jpg', 'png'] as const;

export type DispFileExtension = (typeof DISP_EXTENSIONS)[number];

function isDispFileExtension(value: string): value is DispFileExtension {
  return (DISP_EXTENSIONS as readonly string[]).includes(value);
}

/** DEV: override via `?dispFmt=jpg` or devSettings.terrain.preferredDispFormat. */
export function getDispExtensionOrder(): readonly DispFileExtension[] {
  const urlFmt =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('dispFmt')?.toLowerCase()
      : undefined;
  const preferred = import.meta.env.DEV
    ? (devSettings.terrain.preferredDispFormat ?? urlFmt)
    : urlFmt;
  if (!preferred || !isDispFileExtension(preferred)) {
    return DISP_EXTENSIONS;
  }
  return [preferred, ...DISP_EXTENSIONS.filter((ext) => ext !== preferred)];
}

/** Candidate displacement URLs — extension order from getDispExtensionOrder(). */
export function displacementCandidateUrls(folder: TerrainGltfFolder, colorUrl: string): string[] {
  const prefix = deriveMaterialPrefix(colorUrl);
  if (!prefix) return [];
  const base = `${TERRAIN_TEXTURE_BASE}${folder}/textures/${prefix}`;
  const extensions = getDispExtensionOrder();
  const urls: string[] = [];
  for (const suffix of DISP_SUFFIXES) {
    for (const ext of extensions) {
      urls.push(`${base}_${suffix}_2k.${ext}`);
    }
  }
  return urls;
}

/** First existing displacement file on disk (HEAD probe). */
export async function resolveDisplacementUrl(
  folder: TerrainGltfFolder,
  colorUrl: string,
): Promise<string | null> {
  for (const url of displacementCandidateUrls(folder, colorUrl)) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      // try next candidate
    }
  }
  return null;
}
