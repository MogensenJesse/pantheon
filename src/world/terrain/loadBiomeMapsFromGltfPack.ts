// src/world/terrain/loadBiomeMapsFromGltfPack.ts — per-biome glTF pack → TerrainBiomeMaps
import type { Texture, TextureLoader } from 'three';
import { displacementCandidateUrls, fetchGltfPackUrls } from './loadTerrainGltfPack';
import { packArmToOrm, packRoughMrToOrm } from './packOrmTexture';
import { loadDisplacementTexture, normalizeDisplacementTexture } from './terrainDisplacement';
import {
  createFallbackColor,
  createFallbackDisplacement,
  createFallbackNormal,
  createFallbackOrm,
  createFallbackSpec,
  FALLBACK_COLORS,
} from './terrainFallbacks';
import { configureColorTexture, configureDataTexture } from './terrainTextureConfigure';
import { TERRAIN_SKIP_VERTEX_DISP_BIOMES, type TerrainGltfFolder } from './terrainTextureManifest';
import type { TerrainBiomeMaps } from './terrainTextureTypes';

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

export async function loadBiomeMapsFromGltfPack(
  loader: TextureLoader,
  folder: TerrainGltfFolder,
): Promise<{ maps: TerrainBiomeMaps; hasRealDisplacement: boolean }> {
  const pack = await fetchGltfPackUrls(folder);
  const fallbackHex = FALLBACK_COLORS[folder];

  if (!pack) {
    return {
      maps: {
        color: createFallbackColor(fallbackHex),
        normal: createFallbackNormal(),
        orm: createFallbackOrm(),
        spec: createFallbackSpec(),
        displacement: createFallbackDisplacement(),
      },
      hasRealDisplacement: false,
    };
  }

  const loads = [
    loadTexture(loader, pack.colorUrl, 'color'),
    loadTexture(loader, pack.normalUrl, 'data'),
    loadTexture(loader, pack.mrUrl, 'data'),
  ];
  if (pack.specUrl) {
    loads.push(loadTexture(loader, pack.specUrl, 'data'));
  }

  const results = await Promise.all(loads);
  const [colorEntry, normalEntry, mrEntry] = results;
  const specEntry = pack.specUrl ? results[3] : null;

  const color =
    colorEntry.usedFallback || !colorEntry.texture
      ? createFallbackColor(fallbackHex)
      : colorEntry.texture;
  const normal =
    normalEntry.usedFallback || !normalEntry.texture ? createFallbackNormal() : normalEntry.texture;

  let orm: Texture;
  if (mrEntry.usedFallback || !mrEntry.texture) {
    orm = createFallbackOrm();
  } else {
    orm = pack.mrKind === 'arm' ? packArmToOrm(mrEntry.texture) : packRoughMrToOrm(mrEntry.texture);
    configureDataTexture(orm);
  }

  let spec: Texture = createFallbackSpec();
  if (specEntry && !specEntry.usedFallback && specEntry.texture) {
    spec = specEntry.texture;
  }

  let displacement: Texture = createFallbackDisplacement();
  let hasRealDisplacement = false;
  if (!TERRAIN_SKIP_VERTEX_DISP_BIOMES.includes(folder)) {
    const dispCandidates = displacementCandidateUrls(folder, pack.colorUrl);
    for (const candidate of dispCandidates) {
      const dispEntry = await loadDisplacementTexture(candidate);
      if (dispEntry.usedFallback || !dispEntry.texture) continue;

      const ext = candidate.split('.').pop()?.toLowerCase() ?? '';
      displacement =
        ext === 'exr' ? normalizeDisplacementTexture(dispEntry.texture) : dispEntry.texture;
      hasRealDisplacement = true;
      break;
    }
  }

  return {
    maps: { color, normal, orm, spec, displacement },
    hasRealDisplacement,
  };
}
