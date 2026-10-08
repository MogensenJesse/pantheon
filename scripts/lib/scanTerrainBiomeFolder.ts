// scripts/lib/scanTerrainBiomeFolder.ts — Node scan of a biome PBR folder
import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import {
  describeResolvedBiomeMaps,
  fileExt,
  type PbrMapRole,
  pickBiomePbrMaps,
  posixRel,
  type ResolvedBiomePbrMaps,
  TERRAIN_PBR_IMAGE_EXTS,
} from './pbrMapClassify.ts';

const SKIP_DIR = new Set(['__macosx', 'atlases', 'node_modules']);
const MAX_DEPTH = 4;

interface GltfImage {
  uri?: string;
}

interface GltfTexture {
  source?: number;
}

interface GltfMaterial {
  normalTexture?: { index: number };
  occlusionTexture?: { index: number };
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
  };
  extensions?: {
    KHR_materials_specular?: { specularTexture?: { index: number } };
  };
}

interface GltfRoot {
  materials?: GltfMaterial[];
  textures?: GltfTexture[];
  images?: GltfImage[];
}

function toPosixRel(fromDir: string, absFile: string): string {
  return relative(fromDir, absFile).split(sep).join('/');
}

function readDirents(absDir: string): Dirent[] {
  try {
    return readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Collect files under `absDir` (up to MAX_DEPTH, skipping dot files and junk folders) that `accept` the name of. */
function walkFiles(
  absDir: string,
  depth: number,
  accept: (fileName: string) => boolean,
  out: string[],
): void {
  if (depth > MAX_DEPTH) return;
  for (const entry of readDirents(absDir)) {
    if (entry.name.startsWith('.') || entry.name.startsWith('._')) continue;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name.toLowerCase())) walkFiles(abs, depth + 1, accept, out);
      continue;
    }
    if (entry.isFile() && accept(entry.name)) out.push(abs);
  }
}

function imageUriAt(root: GltfRoot, textureIndex: number | undefined): string | null {
  if (textureIndex === undefined) return null;
  const source = root.textures?.[textureIndex]?.source;
  if (source === undefined) return null;
  const uri = root.images?.[source]?.uri;
  if (!uri || uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://')) {
    return null;
  }
  return posixRel(uri);
}

function roleFromMrUri(rel: string): PbrMapRole {
  const lower = rel.toLowerCase();
  if (/(?:^|[-_/])arm(?:[-_.]|$)/.test(lower) || lower.includes('_arm_')) return 'arm';
  if (/(?:^|[-_/])orm(?:[-_.]|$)/.test(lower) || lower.includes('_orm_')) return 'orm';
  return 'roughness';
}

function collectGltfRoleHints(biomeAbs: string): Map<string, PbrMapRole> {
  const hints = new Map<string, PbrMapRole>();
  const gltfs: string[] = [];
  walkFiles(biomeAbs, 0, (name) => name.toLowerCase().endsWith('.gltf'), gltfs);

  const add = (rel: string | null, role: PbrMapRole, gltfAbs: string) => {
    if (!rel) return;
    const abs = join(dirname(gltfAbs), ...rel.split('/'));
    const biomeRel = toPosixRel(biomeAbs, abs);
    if (biomeRel.startsWith('..') || hints.has(biomeRel)) return;
    hints.set(biomeRel, role);
  };

  for (const gltfAbs of gltfs) {
    let root: GltfRoot;
    try {
      root = JSON.parse(readFileSync(gltfAbs, 'utf8')) as GltfRoot;
    } catch {
      continue;
    }
    const material = root.materials?.[0];
    if (!material) continue;
    const pbr = material.pbrMetallicRoughness;
    add(imageUriAt(root, pbr?.baseColorTexture?.index), 'color', gltfAbs);
    add(imageUriAt(root, material.normalTexture?.index), 'normalGl', gltfAbs);
    const mrRel = imageUriAt(root, pbr?.metallicRoughnessTexture?.index);
    add(mrRel, mrRel ? roleFromMrUri(mrRel) : 'roughness', gltfAbs);
    add(imageUriAt(root, material.occlusionTexture?.index), 'ao', gltfAbs);
    add(
      imageUriAt(root, material.extensions?.KHR_materials_specular?.specularTexture?.index),
      'spec',
      gltfAbs,
    );
  }
  return hints;
}

export function scanTerrainBiomeFolder(biomeAbs: string): ResolvedBiomePbrMaps {
  if (!existsSync(biomeAbs) || !statSync(biomeAbs).isDirectory()) {
    throw new Error(`Terrain biome folder missing: ${biomeAbs}`);
  }
  const imageFiles: string[] = [];
  walkFiles(biomeAbs, 0, (name) => TERRAIN_PBR_IMAGE_EXTS.has(fileExt(name)), imageFiles);
  const relFiles = imageFiles.map((abs) => toPosixRel(biomeAbs, abs));
  const hints = collectGltfRoleHints(biomeAbs);
  const picked = pickBiomePbrMaps(relFiles, hints);
  if (!picked) {
    throw new Error(
      `No color map found in ${biomeAbs} (need a Color / diff / albedo / basecolor image). ` +
        `Found ${relFiles.length} image(s).`,
    );
  }
  return picked;
}

export function formatBiomeScanLog(maps: ResolvedBiomePbrMaps): string {
  return describeResolvedBiomeMaps(maps)
    .map((line) => `  ${line}`)
    .join('\n');
}
