// src/world/terrain/material/createTerrainSplatMaterial.ts — composer for the terrain biome-splat MeshBasicNodeMaterial
//
// ARCHITECTURE NOTE: MeshBasicNodeMaterial with `material.lights = false` and manual
// sun/ambient/shadow via uniforms. Low-poly look: solid biome colors + face normals
// in biomeSplatShading (no atlas / tangent / specular). Path overlay, player glow,
// and prop AO still compose into RGB before the renderer lighting pass.
//
// The actual logic lives in three siblings:
//   - biomeSplatUniforms.ts     uniform creation + per-biome param maps + sun shadow node
//   - biomeSplatDisplacement.ts vertex displacement (off for solid-color play) + biome weights
//   - biomeSplatShading.ts      faceted lighting + path/meadow/snow + player glow

import type { DirectionalLight, Texture } from 'three';
import { Fn, float, positionLocal, positionWorld } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import { createTerrainClipmapTsl, TERRAIN_LAYER_ALPHA_TEST } from '../tsl/terrainClipmapOpacityTsl';
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
  /** R8 prop base contact AO — 1 = open, 0 = under prop. Optional (placeholder when omitted). */
  propAoMap?: Texture;
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
  textures: TerrainTextureSet | null | undefined,
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
    options.propAoMap,
  );

  const vertexDisplacement = options.vertexDisplacement ?? Boolean(textures?.hasDisplacementMaps);
  const detailDispRadialFade = options.detailDispRadialFade ?? false;
  const clipmapTsl = detailDispRadialFade ? createTerrainClipmapTsl(uniforms) : undefined;

  const { positionNode, vSurfaceWorldXZ, biomeHeightWeights } = buildBiomeSplatDisplacement({
    uniforms,
    textures,
    vertexDisplacement,
    clipmapTsl,
  });

  const layerOpacityFn =
    clipmapTsl && options.terrainMeshLayer
      ? options.terrainMeshLayer === 'detail'
        ? clipmapTsl.detailDiskOpacity
        : clipmapTsl.macroExteriorOpacity
      : undefined;

  const { colorNode } = buildBiomeSplatShading({
    uniforms,
    sunShadow,
    vSurfaceWorldXZ,
    biomeHeightWeights,
    earlyDiscardOpacity: layerOpacityFn,
    earlyDiscardThreshold: layerOpacityFn ? TERRAIN_LAYER_ALPHA_TEST : undefined,
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
  if (vertexDisplacement || contactPushM > 0) {
    material.receivedShadowPositionNode = shadowReceivePos;
  }
  material.castShadowPositionNode = positionLocal;
  material.colorNode = colorNode;
  material.terrainUniforms = uniforms;

  if (layerOpacityFn) {
    // Slightly below 0.5 so fine + coarse briefly overlap in the smoothstep band (~1–2 m).
    material.transparent = false;
    material.depthWrite = true;
    material.alphaTest = TERRAIN_LAYER_ALPHA_TEST;
    material.opacityNode = Fn(() => layerOpacityFn(vSurfaceWorldXZ))();
  }

  return material;
}
