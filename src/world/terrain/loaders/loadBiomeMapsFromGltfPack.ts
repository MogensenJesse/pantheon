// src/world/terrain/loadBiomeMapsFromGltfPack.ts — per-biome glTF pack → TerrainBiomeMaps
import type { Texture, TextureLoader } from 'three';
import {
  TERRAIN_GLTF_PACKS,
  TERRAIN_SKIP_VERTEX_DISP_BIOMES,
  type TerrainGltfFolder,
} from '../config/terrainTextureManifest';
import { displacementCandidateUrls, fetchGltfPackUrls } from './loadTerrainGltfPack';
import { packArmToOrm, packRoughMrToOrm } from './packOrmTexture';
import {
  loadDisplacementTexture,
  normalizeDisplacementTexture,
  probeDisplacementUrl,
} from './terrainDisplacement';
import { TerrainPackLoadError } from './terrainLoadErrors';
import { getDefaultSpecTexture, getNeutralDisplacementTexture } from './terrainNeutralTextures';
import { configureColorTexture, configureDataTexture } from './terrainTextureConfigure';
import type { TerrainBiomeMaps } from './terrainTextureTypes';

export interface LoadBiomeMapsOptions {
  /** Editor: load diffuse color only — skip normal/ORM/spec/disp network and ORM pack. */
  colorOnly?: boolean;
}

async function loadRequiredTexture(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
  label: string,
  url: string,
  kind: 'color' | 'data',
): Promise<Texture> {
  try {
    const texture = await loader.loadAsync(url);
    if (kind === 'color') configureColorTexture(texture);
    else configureDataTexture(texture);
    return texture;
  } catch (cause) {
    throw new TerrainPackLoadError(`Terrain texture load failed (${folder} ${label}): ${url}`, {
      cause,
    });
  }
}

export type LoadBiomeMapsResult =
  | { colorOnly: true; color: Texture }
  | { colorOnly: false; maps: TerrainBiomeMaps; hasRealDisplacement: boolean };

export async function loadBiomeMapsFromGltfPack(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
  options: LoadBiomeMapsOptions = {},
): Promise<LoadBiomeMapsResult> {
  const { colorOnly = false } = options;
  const pack = await fetchGltfPackUrls(folder);

  if (!pack) {
    throw new TerrainPackLoadError(
      `Terrain glTF pack not found: ${folder} (${TERRAIN_GLTF_PACKS[folder]})`,
    );
  }

  if (colorOnly) {
    const color = await loadRequiredTexture(loader, folder, 'color', pack.colorUrl, 'color');
    return { colorOnly: true, color };
  }

  const [color, normal, mr] = await Promise.all([
    loadRequiredTexture(loader, folder, 'color', pack.colorUrl, 'color'),
    loadRequiredTexture(loader, folder, 'normal', pack.normalUrl, 'data'),
    loadRequiredTexture(loader, folder, 'metallicRoughness', pack.mrUrl, 'data'),
  ]);

  const orm = pack.mrKind === 'arm' ? packArmToOrm(mr) : packRoughMrToOrm(mr);
  configureDataTexture(orm);

  let spec: Texture = getDefaultSpecTexture();
  if (pack.specUrl) {
    spec = await loadRequiredTexture(loader, folder, 'specular', pack.specUrl, 'data');
  }

  let displacement: Texture = getNeutralDisplacementTexture();
  let hasRealDisplacement = false;
  if (!TERRAIN_SKIP_VERTEX_DISP_BIOMES.includes(folder)) {
    const dispCandidates = displacementCandidateUrls(folder, pack.colorUrl);
    for (const candidate of dispCandidates) {
      if (!(await probeDisplacementUrl(candidate))) continue;

      const dispTexture = await loadDisplacementTexture(folder, candidate);
      const ext = candidate.split('.').pop()?.toLowerCase() ?? '';
      displacement = ext === 'exr' ? normalizeDisplacementTexture(dispTexture) : dispTexture;
      hasRealDisplacement = true;
      break;
    }
  }

  return {
    colorOnly: false,
    maps: { color, normal, orm, spec, displacement },
    hasRealDisplacement,
  };
}
