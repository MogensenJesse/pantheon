// src/world/terrain/loaders/loadTerrainTextures.ts
import type { Texture } from 'three';
import { TextureLoader } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { buildTerrainBiomeAtlases, type TerrainBiomeAtlases } from '../atlas/terrainMapAtlas';
import {
  TERRAIN_SNOW_TEXTURE,
  TERRAIN_TEXTURE_BIOMES,
  type TerrainGltfFolder,
} from '../config/terrainTextureManifest';
import { loadBakedTerrainAtlases } from './loadBakedTerrainAtlases';
import { loadBiomeMapsFromGltfPack } from './loadBiomeMapsFromGltfPack';
import type { TerrainTextureSet } from './terrainTextureTypes';

export { initTerrainAtlases } from '../atlas/terrainMapAtlas';
export type { TerrainBiomeMaps, TerrainTextureSet } from './terrainTextureTypes';
export type { TerrainBiomeAtlases };

export interface TerrainTextureLoadOptions {
  /** Editor: load color maps only; skip normal/ORM/spec/disp + neutral-fill non-color atlases. */
  colorOnly?: boolean;
  /**
   * Play: required for baked KTX2 atlases (`npm run bake:terrain-atlases`).
   * Ignored when `colorOnly` (editor keeps runtime canvas pack).
   */
  renderer?: WebGPURenderer;
}

async function loadRuntimePackedTerrainTextures(colorOnly: boolean): Promise<TerrainTextureSet> {
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

/**
 * Play: baked KTX2 atlases (requires `renderer` after `init()`).
 * Editor: `colorOnly: true` keeps runtime canvas pack from Poly Haven sources.
 */
export async function loadTerrainTextures(
  options: TerrainTextureLoadOptions = {},
): Promise<TerrainTextureSet> {
  const { colorOnly = false, renderer } = options;
  if (colorOnly) {
    return loadRuntimePackedTerrainTextures(true);
  }
  if (!renderer) {
    throw new Error('loadTerrainTextures play path requires { renderer } for baked KTX2 atlases');
  }
  return loadBakedTerrainAtlases(renderer);
}
