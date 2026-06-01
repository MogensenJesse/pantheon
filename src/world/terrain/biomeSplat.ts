// src/world/terrain/biomeSplat.ts — composer for the terrain biome-splat MeshBasicNodeMaterial
//
// ARCHITECTURE NOTE (see F26 evaluation): this material uses MeshBasicNodeMaterial with
// `material.lights = false` and drives sun/ambient/shadow manually via uniforms. Migration
// to MeshStandardNodeMaterial would let three.js manage sun/ambient/shadow on the colorNode,
// but the path-blend overlay, biome splatting, player glow injection, and stylized specular
// (ORM metalness boost) all expect to compose into the final RGB before the renderer's
// own lighting pass — and `MeshStandardNodeMaterial`'s lighting pipeline expects a
// pre-shadow albedo + roughness/metalness split. Keeping the manual lighting here keeps
// the path overlay and player aura simple and shadow-aware (`sunVisFloor` keeps occluded
// areas softly lit). Re-evaluate when three.js exposes lighting-stage hooks on standard
// node materials, or if we need IBL/multi-light support.
//
// The actual logic lives in three siblings:
//   - biomeSplatUniforms.ts     uniform creation + path segment arrays + sun shadow node
//   - biomeSplatDisplacement.ts vertex displacement + shared biome weight Fn
//   - biomeSplatShading.ts      fragment lighting + path blend + player glow composite

import { MeshBasicNodeMaterial } from 'three/webgpu';
import { positionWorld } from 'three/tsl';
import type { DirectionalLight, Texture } from 'three';
import { createBiomeSplatUniforms } from './biomeSplatUniforms';
import { buildBiomeSplatDisplacement } from './biomeSplatDisplacement';
import { buildBiomeSplatShading } from './biomeSplatShading';
import type { TerrainTextureSet } from './loadTerrainTextures';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

export type {
  TerrainSplatUniforms,
  BiomeSplatThresholds,
} from './biomeSplatUniforms';
export { biomeSplatThresholds } from './biomeSplatUniforms';

export type TerrainSplatMaterial = MeshBasicNodeMaterial & {
  terrainUniforms: TerrainSplatUniforms;
};

export interface BiomeSplatMaterialOptions {
  biomeMap?: Texture;
  pathMap?: Texture;
}

export function createBiomeSplatMaterial(
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  options?: BiomeSplatMaterialOptions,
): TerrainSplatMaterial {
  const { uniforms, sunShadow } = createBiomeSplatUniforms(
    sun,
    options?.biomeMap,
    options?.pathMap,
  );

  const { positionNode, vPathW, biomeHeightWeights } = buildBiomeSplatDisplacement({
    uniforms,
    textures,
  });

  const { colorNode } = buildBiomeSplatShading({
    uniforms,
    sunShadow,
    textures,
    vPathW,
    biomeHeightWeights,
  });

  const material = new MeshBasicNodeMaterial() as TerrainSplatMaterial;
  material.lights = false;
  material.positionNode = positionNode as never;
  material.receivedShadowPositionNode = positionWorld;
  material.colorNode = colorNode as never;
  material.terrainUniforms = uniforms;

  return material;
}
