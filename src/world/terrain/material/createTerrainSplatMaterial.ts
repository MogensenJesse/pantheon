// src/world/terrain/material/createTerrainSplatMaterial.ts — composer for the terrain biome-splat MeshBasicNodeMaterial
//
// ARCHITECTURE NOTE (see F26 evaluation): this material uses MeshBasicNodeMaterial with
// `material.lights = false` and drives sun/ambient/shadow manually via uniforms. Migration
// to MeshStandardNodeMaterial would let three.js manage sun/ambient/shadow on the colorNode,
// but the path-blend overlay, biome splatting, player glow injection, and hue-split
// lighting all expect to compose into the final RGB before the renderer's own lighting
// pass — and `MeshStandardNodeMaterial`'s lighting pipeline expects a pre-shadow albedo
// + roughness/metalness split. Keeping the manual lighting here keeps the path overlay
// and player aura simple and shadow-aware (`sunVisFloor` keeps occluded areas softly
// lit). Re-evaluate when three.js exposes lighting-stage hooks on standard node
// materials, or if we need IBL/multi-light support.
//
// The actual logic lives in three siblings:
//   - biomeSplatUniforms.ts     uniform creation + per-biome param maps + sun shadow node
//   - biomeSplatDisplacement.ts vertex displacement + shared biome weight Fn
//   - biomeSplatShading.ts      fragment lighting + path blend + player glow composite

import type { DirectionalLight, Texture } from 'three';
import { float, positionLocal, positionWorld } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
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
  biomeIdMap: Texture;
  /** R8 prop base contact AO — 1 = open, 0 = under prop. Optional (placeholder when omitted). */
  propAoMap?: Texture;
  /** Packed RGBA8 slope/convex/normal. Optional (flat placeholder when omitted). */
  terrainAuxMap?: Texture;
  /** Omit vertex displacement shader path when false (default true — GPU height + chisel). */
  vertexDisplacement?: boolean;
  /**
   * Editor: albedo splat + hue-split (no ORM / shadows / glow). Play omits
   * (default false).
   */
  simpleShading?: boolean;
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
    options.biomeIdMap,
    options.propAoMap,
    options.terrainAuxMap,
  );

  const vertexDisplacement = options.vertexDisplacement ?? true;
  const simpleShading = options.simpleShading ?? false;

  const {
    positionNode,
    vSurfaceWorldXZ,
    chiseledWorldNormalAtWorldXZ,
    biomeHeightWeights,
    sampleHeightNormAtWorldXZ,
  } = buildBiomeSplatDisplacement({
    uniforms,
    vertexDisplacement,
  });

  const { colorNode } = buildBiomeSplatShading({
    uniforms,
    sunShadow,
    textures,
    vSurfaceWorldXZ,
    chiseledWorldNormalAtWorldXZ,
    biomeHeightWeights,
    sampleHeightNormAtWorldXZ,
    simpleShading,
  });

  const material = new MeshBasicNodeMaterial() as TerrainSplatMaterial;
  material.lights = false;
  material.positionNode = positionNode;
  // Push receive sample away from the sun so contact under props stays in umbra (closes
  // lit rings from displacement mismatch / neutral bias). uSunDirection points toward sun.
  const contactPushM = VISUAL.shadows.lighting.shadowContactPushM;
  const shadowReceivePos =
    contactPushM > 0
      ? positionWorld.sub((uniforms.uSunDirection as any).mul(float(contactPushM)))
      : positionWorld;
  if (!simpleShading && (vertexDisplacement || contactPushM > 0)) {
    material.receivedShadowPositionNode = shadowReceivePos;
  }
  material.castShadowPositionNode = positionLocal;
  material.colorNode = colorNode;
  material.terrainUniforms = uniforms;

  return material;
}
