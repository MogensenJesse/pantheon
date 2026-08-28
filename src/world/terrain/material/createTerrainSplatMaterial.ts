// src/world/terrain/material/createTerrainSplatMaterial.ts — composer for the terrain biome-splat MeshBasicNodeMaterial
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
//   - biomeSplatUniforms.ts     uniform creation + per-biome param maps + sun shadow node
//   - biomeSplatDisplacement.ts vertex displacement + shared biome weight Fn
//   - biomeSplatShading.ts      fragment lighting + path blend + player glow composite

import type { DirectionalLight, Texture } from 'three';
import { float, positionLocal, positionWorld } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
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

/** Play LOD layer — opaque coverage at detail/macro radii with a short coarser underlay. */
export type TerrainMeshLayer = 'detail' | 'mid' | 'far';

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
  /** Omit vertex displacement shader path when false (default: textures.hasDisplacementMaps). */
  vertexDisplacement?: boolean;
  /**
   * Play mode: radial detail-disp fade around uDetailPatchOrigin; skip disp-atlas samples
   * outside detailRadiusM. Editor omits (default false).
   */
  detailDispRadialFade?: boolean;
  /** Play LOD layer — opaque coverage with a short coarser underlay at the cut. */
  terrainMeshLayer?: TerrainMeshLayer;
  /**
   * Editor: albedo splat + Lambert (no breakup / PBR / shadows / glow). Play omits
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

  const vertexDisplacement = options.vertexDisplacement ?? textures.hasDisplacementMaps;
  const detailDispRadialFade = options.detailDispRadialFade ?? false;
  const simpleShading = options.simpleShading ?? false;
  const clipmapTsl = detailDispRadialFade ? createTerrainClipmapTsl(uniforms) : undefined;

  const {
    positionNode,
    vSurfaceWorldXZ,
    vMacroNormal,
    biomeHeightWeights,
    sampleHeightNormAtWorldXZ,
  } = buildBiomeSplatDisplacement({
    uniforms,
    textures,
    vertexDisplacement,
    clipmapTsl,
    applyDetailDisplacement:
      options.terrainMeshLayer !== 'mid' && options.terrainMeshLayer !== 'far',
  });

  const layer = options.terrainMeshLayer;
  const layerDiscardFn =
    clipmapTsl && layer
      ? layer === 'detail'
        ? clipmapTsl.detailCoverageDiscard
        : layer === 'mid'
          ? clipmapTsl.midCoverageDiscard
          : clipmapTsl.farCoverageDiscard
      : undefined;

  const { colorNode } = buildBiomeSplatShading({
    uniforms,
    sunShadow,
    textures,
    vSurfaceWorldXZ,
    vMacroNormal,
    biomeHeightWeights,
    sampleHeightNormAtWorldXZ,
    earlyDiscardWhen: layerDiscardFn,
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
  // Coarser overlap underlay sits slightly behind so matched heights do not z-fight.
  if (layer === 'mid') {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 4;
  } else if (layer === 'far') {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 2;
    material.polygonOffsetUnits = 8;
  }

  return material;
}
