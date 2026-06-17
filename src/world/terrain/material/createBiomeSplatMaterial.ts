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
   * When false, vertex shader applies macro height only — no detail displacement atlas samples.
   * Default: same as vertexDisplacement.
   */
  sampleDetailDisplacement?: boolean;
  /** Circular clip on the detail disk — macro exterior stays fully opaque underneath. */
  clipmapDetailDisk?: boolean;
}

export function createBiomeSplatMaterial(
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
  const sampleDetailDisplacement =
    options.sampleDetailDisplacement ?? vertexDisplacement;
  const clipmapDetailDisk = options.clipmapDetailDisk ?? false;
  const clipmapTsl = clipmapDetailDisk ? createTerrainClipmapTsl(uniforms) : undefined;

  const {
    positionNode,
    vSurfaceWorldXZ,
    biomeHeightWeights,
  } = buildBiomeSplatDisplacement({
    uniforms,
    textures,
    vertexDisplacement,
    sampleDetailDisplacement,
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
  // Macro CPU height only if this material ever casts (shadow pass must not sample splat textures).
  material.castShadowPositionNode = positionLocal;
  material.colorNode = colorNode as never;
  material.terrainUniforms = uniforms;

  if (clipmapTsl) {
    const { detailDiskOpacity } = clipmapTsl;
    // Opaque alpha-cutout (not blended transparency): discard outside the detail circle,
    // fully solid inside. Macro exterior is opaque underneath.
    material.transparent = false;
    material.depthWrite = true;
    material.alphaTest = 0.5;
    material.opacityNode = Fn(() => detailDiskOpacity(vSurfaceWorldXZ))() as never;
  }

  return material;
}

/** Public alias — matches historical import name. */
export const createTerrainSplatMaterial = createBiomeSplatMaterial;
