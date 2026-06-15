// src/world/terrain/shadow/terrainShadowCast.ts — macro hill silhouettes for sun shadow map (WebGPU)
//
// Uses CPU-sculpted geometry Y + shared minimal shadow material (no splat shaders).

import { type BufferGeometry, Mesh } from 'three';
import {
  configureMeshShadowCast,
  getShadowCastMaterial,
} from '../../../rendering/shadowCastConfig';

/** Render layer for terrain shadow casters (hidden from the main camera on layer 0). */
export const TERRAIN_SHADOW_LAYER = 1;

export function createTerrainShadowCastMesh(geometry: BufferGeometry): Mesh {
  const mesh = new Mesh(geometry, getShadowCastMaterial());
  mesh.name = 'terrainShadowCast';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.layers.disable(0);
  mesh.layers.enable(TERRAIN_SHADOW_LAYER);
  configureMeshShadowCast(mesh);
  return mesh;
}

export function disposeTerrainShadowCastMesh(mesh: Mesh): void {
  mesh.removeFromParent();
  // Shared shadowCastMaterial is not disposed per mesh.
}
