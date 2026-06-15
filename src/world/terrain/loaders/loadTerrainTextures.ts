// src/world/terrain/loaders/loadTerrainTextures.ts
import { type Texture, TextureLoader } from 'three';
import { buildTerrainBiomeAtlases, type TerrainBiomeAtlases } from '../atlas/terrainMapAtlas';
import {
  TERRAIN_SNOW_TEXTURE,
  TERRAIN_TEXTURE_BIOMES,
  type TerrainGltfFolder,
} from '../config/terrainTextureManifest';
import { loadBiomeMapsFromGltfPack } from './loadBiomeMapsFromGltfPack';
import type { TerrainTextureSet } from './terrainTextureTypes';

export { initTerrainAtlases } from '../atlas/terrainMapAtlas';
export type { TerrainBiomeMaps, TerrainTextureSet } from './terrainTextureTypes';
export type { TerrainBiomeAtlases };

export interface TerrainTextureLoadOptions {
  /** Editor: load color maps only; skip normal/ORM/spec/disp + neutral-fill non-color atlases. */
  colorOnly?: boolean;
}

export async function loadTerrainTextures(
  options: TerrainTextureLoadOptions = {},
): Promise<TerrainTextureSet> {
  const { colorOnly = false } = options;
  const loader = new TextureLoader();
  const biomeFolders = [...TERRAIN_TEXTURE_BIOMES, TERRAIN_SNOW_TEXTURE] as TerrainGltfFolder[];

  const entries = await Promise.all(
    biomeFolders.map(async (folder) => {
      const result = await loadBiomeMapsFromGltfPack(loader, folder, { colorOnly });
      return [folder, result] as const;
    }),
  );

  const hasDisplacementMaps = colorOnly
    ? false
    : entries.some(([, r]) => !r.colorOnly && r.hasRealDisplacement);

  const layerSets = colorOnly
    ? {
        color: entries.map(([, r]) => {
          if (!r.colorOnly) throw new Error('Unexpected full biome result in colorOnly load');
          return r.color;
        }),
        normal: [] as Texture[],
        orm: [] as Texture[],
        spec: [] as Texture[],
        displacement: [] as Texture[],
      }
    : {
        color: entries.map(([, r]) => {
          if (r.colorOnly) throw new Error('Unexpected colorOnly biome result in full load');
          return r.maps.color;
        }),
        normal: entries.map(([, r]) => {
          if (r.colorOnly) throw new Error('Unexpected colorOnly biome result in full load');
          return r.maps.normal;
        }),
        orm: entries.map(([, r]) => {
          if (r.colorOnly) throw new Error('Unexpected colorOnly biome result in full load');
          return r.maps.orm;
        }),
        spec: entries.map(([, r]) => {
          if (r.colorOnly) throw new Error('Unexpected colorOnly biome result in full load');
          return r.maps.spec;
        }),
        displacement: entries.map(([, r]) => {
          if (r.colorOnly) throw new Error('Unexpected colorOnly biome result in full load');
          return r.maps.displacement;
        }),
      };

  const atlases = buildTerrainBiomeAtlases(layerSets, { nonColorNeutralOnly: colorOnly });

  if (!colorOnly) {
    for (const [, r] of entries) {
      if (!r.colorOnly) {
        r.maps.displacement.dispose();
      }
    }
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
