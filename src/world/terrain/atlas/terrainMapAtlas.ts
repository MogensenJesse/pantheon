// src/world/terrain/atlas/terrainMapAtlas.ts — the baked atlas pair the splat material samples
import type { DataTexture, Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createR8Placeholder } from '../../../map/dataTexture';

export interface TerrainBiomeAtlases {
  color: Texture;
  /** AO in `.r`. Baked KTX2 in play; a 1×1 stub in the editor (simple shading skips AO). */
  ao: Texture;
}

/** 1×1 open AO for the editor, which samples no AO atlas. */
export function createStubAoAtlas(): DataTexture {
  return createR8Placeholder(255);
}

/** Upload mips and set anisotropy — call once after renderer.init(). */
export function initTerrainAtlases(
  renderer: WebGPURenderer,
  atlases: TerrainBiomeAtlases,
  anisotropy = 4,
): void {
  for (const tex of [atlases.color, atlases.ao]) {
    tex.anisotropy = anisotropy;
    renderer.initTexture(tex);
  }
}
