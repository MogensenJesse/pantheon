// src/world/terrain/loaders/loadBiomeMapsFromGltfPack.ts — per-biome folder → color map (editor)
import type { Texture, TextureLoader } from 'three';
import { TERRAIN_GLTF_PACKS, type TerrainGltfFolder } from '../config/terrainTextureManifest';
import { fetchGltfPackUrls } from './loadTerrainGltfPack';
import { fetchTerrainBiomeMapCatalog } from './terrainBiomeMapCatalog';
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

/** Editor canvas pack: load the biome's color map (scanned PBR folder, else glTF). Play uses baked atlases. */
export async function loadBiomeMapsFromGltfPack(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
): Promise<Texture> {
  const catalog = await fetchTerrainBiomeMapCatalog();
  const scannedUrl = catalog?.biomes[folder]?.colorUrl;
  if (scannedUrl) {
    return loadColorTexture(loader, folder, scannedUrl);
  }

  const pack = await fetchGltfPackUrls(folder);
  if (!pack) {
    throw new TerrainPackLoadError(
      `Terrain color map not found: ${folder}. Drop a PBR set into public/textures/terrain/${folder}/ ` +
        `(or keep ${TERRAIN_GLTF_PACKS[folder]}).`,
    );
  }

  return loadColorTexture(loader, folder, pack.colorUrl);
}
