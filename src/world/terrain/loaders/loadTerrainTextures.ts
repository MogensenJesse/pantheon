// src/world/terrain/loaders/loadTerrainTextures.ts
import type { Texture } from 'three';
import { TextureLoader } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { TERRAIN_ATLAS_BIOME_KEYS } from '../atlas/atlasConstants';
import { buildTerrainBiomeAtlases, type TerrainBiomeAtlases } from '../atlas/terrainMapAtlas';
import type { TerrainGltfFolder } from '../config/terrainTextureManifest';
import { loadBakedTerrainAtlases } from './loadBakedTerrainAtlases';
import { loadBiomeMapsFromGltfPack } from './loadBiomeMapsFromGltfPack';
import type { TerrainTextureSet } from './terrainTextureTypes';

export { initTerrainAtlases } from '../atlas/terrainMapAtlas';
export type { TerrainTextureSet } from './terrainTextureTypes';
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

async function loadEditorColorPackedTerrainTextures(): Promise<TerrainTextureSet> {
  const loader = new TextureLoader();
  const biomeFolders = TERRAIN_ATLAS_BIOME_KEYS as readonly TerrainGltfFolder[];

  const colors = await Promise.all(
    biomeFolders.map((folder) => loadBiomeMapsFromGltfPack(loader, folder)),
  );

  const empty: Texture[] = [];
  const atlases = buildTerrainBiomeAtlases(
    {
      color: colors,
      normal: empty,
      orm: empty,
      spec: empty,
      displacement: empty,
    },
    { nonColorNeutralOnly: true },
  );

  return {
    atlases,
    detailDisplacement: atlases.detailDisplacement,
    hasDisplacementMaps: false,
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
    return loadEditorColorPackedTerrainTextures();
  }
  if (!renderer) {
    throw new Error('loadTerrainTextures play path requires { renderer } for baked KTX2 atlases');
  }
  return loadBakedTerrainAtlases(renderer);
}
