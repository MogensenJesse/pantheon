// src/world/terrain/loaders/loadTerrainGltfPack.ts — parse Poly Haven glTF packs (JSON only, no mesh)
import { VISUAL } from '../../../config/visualTuning';
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

function parseGltfPackUrls(folder: TerrainGltfFolder, root: GltfRoot): GltfPackUrls | null {
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

/** Derive Poly Haven material prefix from a glTF color map URI (e.g. `aerial_rocks_02`). */
export function deriveMaterialPrefix(colorUrl: string): string | null {
  const match = colorUrl.match(/([^/]+)_(?:diff|diffuse)_(?:1k|2k)\.(?:jpg|jpeg|png)$/i);
  return match?.[1] ?? null;
}

const DISP_SUFFIXES = ['disp', 'displacement'] as const;
const DISP_EXTENSIONS = ['exr', 'jpg', 'png'] as const;

export type DispFileExtension = (typeof DISP_EXTENSIONS)[number];

function isDispFileExtension(value: string): value is DispFileExtension {
  return (DISP_EXTENSIONS as readonly string[]).includes(value);
}

function getDispExtensionOrder(): readonly DispFileExtension[] {
  const preferred = VISUAL.terrain.preferredDispFormat;
  if (!isDispFileExtension(preferred)) {
    return DISP_EXTENSIONS;
  }
  return [preferred, ...DISP_EXTENSIONS.filter((ext) => ext !== preferred)];
}

function getDispResolutionOrder(): readonly ('1k' | '2k')[] {
  return VISUAL.terrain.preferredDispResolution === '1k' ? ['1k', '2k'] : ['2k', '1k'];
}

/** Candidate displacement URLs — resolution order from `VISUAL.terrain.preferredDispResolution`. */
export function displacementCandidateUrls(folder: TerrainGltfFolder, colorUrl: string): string[] {
  const prefix = deriveMaterialPrefix(colorUrl);
  if (!prefix) return [];
  const base = `${TERRAIN_TEXTURE_BASE}${folder}/textures/${prefix}`;
  const extensions = getDispExtensionOrder();
  const resolutions = getDispResolutionOrder();
  const urls: string[] = [];
  for (const suffix of DISP_SUFFIXES) {
    for (const res of resolutions) {
      for (const ext of extensions) {
        urls.push(`${base}_${suffix}_${res}.${ext}`);
      }
    }
  }
  return urls;
}
