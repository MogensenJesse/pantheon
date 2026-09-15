// src/world/grass/tsl/grassDepthBiasTsl.ts - pull grass depth toward camera over terrain z-fight
import type { SpriteNodeMaterial } from 'three/webgpu';

/**
 * Previously wrote a custom depthNode via viewZToPerspectiveDepth.
 * After three r186 that override made grass lose the depth test except at some pitches
 * (bias amount did not help). Default sprite depth is used instead; grass gets a small
 * world-Y lift in the material to limit terrain z-fighting.
 */
export function applyGrassTerrainDepthBias(_material: SpriteNodeMaterial): void {
  // no-op on three r186+
}

