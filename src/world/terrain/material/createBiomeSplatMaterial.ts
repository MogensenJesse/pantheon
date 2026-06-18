// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/material/createBiomeSplatMaterial.ts — composer for the terrain biome-splat MeshBasicNodeMaterial
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

import type { DirectionalLight, Texture } from 'three';
import { Fn, positionLocal, positionWorld } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import { createTerrainClipmapTsl } from '../tsl/terrainClipmapOpacityTsl';
import { buildBiomeSplatDisplacement } from './biomeSplatDisplacement';
import { buildBiomeSplatShading } from './biomeSplatShading';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import { createBiomeSplatUniforms } from './biomeSplatUniforms';

export type {
  BiomeSplatThresholds,
  TerrainSplatUniforms,
} from './biomeSplatUniforms';

export type TerrainSplatMaterial = MeshBasicNodeMaterial & {
  terrainUniforms: TerrainSplatUniforms;
};

/** Complementary visibility at detailRadiusM when play uses fine + coarse meshes. */
export type TerrainMeshLayer = 'detail' | 'macro';

export interface BiomeSplatMaterialOptions {
  biomeMap: Texture;
  pathMap: Texture;
  meadowMap: Texture;
  heightMap: Texture;
  /** PlaneGeometry segments per axis — drives macro-normal finite-difference step. */
  meshSegments?: number;
  /** Omit vertex displacement shader path when false (default: textures.hasDisplacementMaps). */
  vertexDisplacement?: boolean;
  /**
   * Play mode: radial detail-disp fade around uDetailPatchOrigin; skip disp-atlas samples
   * outside detailRadiusM. Editor omits (default false).
   */
  detailDispRadialFade?: boolean;
  /** Play fine/coarse layer — sets complementary alpha cutout at detailRadiusM. */
  terrainMeshLayer?: TerrainMeshLayer;
}

export function createTerrainSplatMaterial(
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  options: BiomeSplatMaterialOptions,
): TerrainSplatMaterial {
  const { uniforms, sunShadow } = createBiomeSplatUniforms(
    sun,
    options.biomeMap,
    options.pathMap,
    options.meadowMap,
    options.heightMap,
    options.meshSegments,
  );

  const vertexDisplacement = options.vertexDisplacement ?? textures.hasDisplacementMaps;
  const detailDispRadialFade = options.detailDispRadialFade ?? false;
  const clipmapTsl = detailDispRadialFade ? createTerrainClipmapTsl(uniforms) : undefined;

  const { positionNode, vSurfaceWorldXZ, biomeHeightWeights } = buildBiomeSplatDisplacement({
    uniforms,
    textures,
    vertexDisplacement,
    clipmapTsl,
  });

  const { colorNode } = buildBiomeSplatShading({
    uniforms,
    sunShadow,
    textures,
    vSurfaceWorldXZ,
    biomeHeightWeights,
  });

  const material = new MeshBasicNodeMaterial() as TerrainSplatMaterial;
  material.lights = false;
  material.positionNode = positionNode as never;
  if (vertexDisplacement) {
    material.receivedShadowPositionNode = positionWorld;
  }
  material.castShadowPositionNode = positionLocal;
  material.colorNode = colorNode as never;
  material.terrainUniforms = uniforms;

  if (clipmapTsl && options.terrainMeshLayer) {
    const opacityFn =
      options.terrainMeshLayer === 'detail'
        ? clipmapTsl.detailDiskOpacity
        : clipmapTsl.macroExteriorOpacity;
    // Slightly below 0.5 so fine + coarse briefly overlap in the smoothstep band (~1–2 m).
    material.transparent = false;
    material.depthWrite = true;
    material.alphaTest = 0.42;
    material.opacityNode = Fn(() => opacityFn(vSurfaceWorldXZ))() as never;
  }

  return material;
}
