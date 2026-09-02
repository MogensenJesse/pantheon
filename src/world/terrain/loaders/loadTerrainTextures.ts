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
  /** Editor: color atlas only (stub AO). Prefers play `color.ktx2` when `renderer` is set. */
  colorOnly?: boolean;
  /**
   * Required for baked KTX2. Editor should pass the WebGPU renderer so color.ktx2
   * can load; canvas-pack at 1024 is the fallback if the bake is missing.
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
      ao: empty,
    },
    { colorOnly: true },
  );

  return {
    atlases,
    dispose() {
      atlases.color.dispose();
      atlases.ao.dispose();
    },
  };
}

/**
 * Play: baked KTX2 color + AO (requires `renderer` after `init()`).
 * Editor: `colorOnly: true` prefers `color.ktx2`, else canvas-packs 1024 tiles.
 */
export async function loadTerrainTextures(
  options: TerrainTextureLoadOptions = {},
): Promise<TerrainTextureSet> {
  const { colorOnly = false, renderer } = options;
  if (colorOnly) {
    if (renderer) {
      try {
        return await loadBakedTerrainAtlases(renderer, { colorOnly: true });
      } catch {
        /* missing bake — fall through to canvas pack */
      }
    }
    return loadEditorColorPackedTerrainTextures();
  }
  if (!renderer) {
    throw new Error('loadTerrainTextures play path requires { renderer } for baked KTX2 atlases');
  }
  return loadBakedTerrainAtlases(renderer);
}
