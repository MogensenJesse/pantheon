// src/world/terrain/loaders/loadBiomeMapsFromGltfPack.ts — per-biome glTF pack → color map (editor)
import type { Texture, TextureLoader } from 'three';
import { TERRAIN_GLTF_PACKS, type TerrainGltfFolder } from '../config/terrainTextureManifest';
import { fetchGltfPackUrls } from './loadTerrainGltfPack';
import { TerrainPackLoadError } from './terrainLoadErrors';
import { configureColorTexture } from './terrainTextureConfigure';

async function loadColorTexture(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
  url: string,
): Promise<Texture> {
  try {
    const texture = await loader.loadAsync(url);
    configureColorTexture(texture);
    return texture;
  } catch (cause) {
    throw new TerrainPackLoadError(`Terrain texture load failed (${folder} color): ${url}`, {
      cause,
    });
  }
}

/** Editor canvas pack: load the pack's diffuse color only. Play uses baked atlases. */
export async function loadBiomeMapsFromGltfPack(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
): Promise<Texture> {
  const pack = await fetchGltfPackUrls(folder);

  if (!pack) {
    throw new TerrainPackLoadError(
      `Terrain glTF pack not found: ${folder} (${TERRAIN_GLTF_PACKS[folder]})`,
    );
  }

  return loadColorTexture(loader, folder, pack.colorUrl);
}
