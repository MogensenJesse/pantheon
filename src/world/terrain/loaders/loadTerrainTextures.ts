// src/world/terrain/loaders/loadTerrainTextures.ts
import type { WebGPURenderer } from 'three/webgpu';
import type { TerrainTextureSet } from './terrainTextureTypes';

export { initTerrainAtlases } from '../atlas/terrainMapAtlas';
export type { TerrainBiomeMaps, TerrainTextureSet } from './terrainTextureTypes';

export interface TerrainTextureLoadOptions {
  /** Ignored — play/editor use solid biome colors (no atlas pack). */
  colorOnly?: boolean;
  /** Ignored — kept so existing play/editor call sites still type-check. */
  renderer?: WebGPURenderer;
}

/** Empty set — splat shader uses VISUAL.terrain.solidColors, not atlases. */
export function createStubTerrainTextureSet(): TerrainTextureSet {
  return {
    atlases: null,
    detailDisplacement: null,
    hasDisplacementMaps: false,
    dispose() {},
  };
}

/**
 * Play and editor: no KTX2 / glTF pack. Bake scripts remain for a possible later revert.
 */
export async function loadTerrainTextures(
  _options: TerrainTextureLoadOptions = {},
): Promise<TerrainTextureSet> {
  return createStubTerrainTextureSet();
}
