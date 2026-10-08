// src/world/terrain/loaders/loadTerrainTextures.ts
import type { WebGPURenderer } from 'three/webgpu';
import { loadBakedTerrainAtlases } from './loadBakedTerrainAtlases';
import type { TerrainTextureSet } from './terrainTextureTypes';

export { initTerrainAtlases } from '../atlas/terrainMapAtlas';
export type { TerrainTextureSet } from './terrainTextureTypes';

export interface TerrainTextureLoadOptions {
  /** Needed for KTX2 transcoding: pass the initialised WebGPU renderer. */
  renderer: WebGPURenderer;
  /** Editor: skip `ao.ktx2` (1×1 stub; simple shading samples no AO). */
  colorOnly?: boolean;
}

/**
 * Load the offline-baked atlases (`npm run bake:terrain-atlases`). Play and editor share the same
 * `color.ktx2`; there is no runtime fallback packer.
 */
export function loadTerrainTextures(
  options: TerrainTextureLoadOptions,
): Promise<TerrainTextureSet> {
  return loadBakedTerrainAtlases(options.renderer, { colorOnly: options.colorOnly });
}
