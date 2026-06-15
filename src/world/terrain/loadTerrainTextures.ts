// src/world/terrain/loadTerrainTextures.ts
import { TextureLoader } from 'three';
import { loadBiomeMapsFromGltfPack } from './loadBiomeMapsFromGltfPack';
import { buildTerrainBiomeAtlases, type TerrainBiomeAtlases } from './terrainMapAtlas';
import {
  TERRAIN_SNOW_TEXTURE,
  TERRAIN_TEXTURE_BIOMES,
  type TerrainGltfFolder,
} from './terrainTextureManifest';

import type { TerrainTextureSet } from './terrainTextureTypes';

export { initTerrainAtlases } from './terrainMapAtlas';
export type { TerrainBiomeMaps, TerrainTextureSet } from './terrainTextureTypes';
export type { TerrainBiomeAtlases };

export async function loadTerrainTextures(): Promise<TerrainTextureSet> {
  const loader = new TextureLoader();
  const biomeFolders = [...TERRAIN_TEXTURE_BIOMES, TERRAIN_SNOW_TEXTURE] as TerrainGltfFolder[];

  const entries = await Promise.all(
    biomeFolders.map(async (folder) => {
      const result = await loadBiomeMapsFromGltfPack(loader, folder);
      return [folder, result] as const;
    }),
  );

  const maps = entries.map(([, r]) => r.maps);
  const hasDisplacementMaps = entries.some(([, r]) => r.hasRealDisplacement);
  const layerSets = {
    color: maps.map((m) => m.color),
    normal: maps.map((m) => m.normal),
    orm: maps.map((m) => m.orm),
    spec: maps.map((m) => m.spec),
    displacement: maps.map((m) => m.displacement),
  };

  const atlases = buildTerrainBiomeAtlases(layerSets);

  for (const m of maps) {
    m.displacement.dispose();
  }

  return {
    atlases,
    detailDisplacement: atlases.detailDisplacement,
    hasDisplacementMaps,
    dispose() {
      atlases.color.dispose();
      atlases.normal.dispose();
      atlases.orm.dispose();
      atlases.spec.dispose();
      atlases.detailDisplacement.dispose();
    },
  };
}
