// src/world/terrain/material/createTerrainSplatMaterial.ts — composer for the terrain biome-splat MeshBasicNodeMaterial
//
// ARCHITECTURE NOTE: this material uses MeshBasicNodeMaterial with `material.lights = false` and
// drives sun/ambient/shadow manually via uniforms. MeshStandardNodeMaterial would let three.js manage
// them on the colorNode, but biome splatting, the path/meadow/water overlays, player glow and the
// hue-split lighting all compose into the final RGB before the renderer's own lighting pass, and the
// standard pipeline expects a pre-shadow albedo + roughness/metalness split. Manual lighting keeps the
// overlays and player aura simple and shadow-aware (`sunVisFloor` keeps occluded areas softly lit).
// Re-evaluate when three.js exposes lighting-stage hooks on standard node materials, or if we need
// IBL/multi-light support.
//
// The actual logic lives in three siblings:
//   - biomeSplatUniforms.ts     uniform creation + per-biome param maps + sun shadow node
//   - biomeSplatDisplacement.ts vertex displacement + chisel height/normal Fns
//   - biomeSplatShading.ts      fragment lighting + overlay blend + player glow composite

import type { DirectionalLight } from 'three';
import { positionLocal } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import type { MacroHeightTsl } from '../tsl/terrainMacroHeightTsl';
import { buildBiomeSplatDisplacement } from './biomeSplatDisplacement';
import { buildBiomeSplatShading } from './biomeSplatShading';
import type { BiomeSplatTextures, TerrainSplatUniforms } from './biomeSplatUniforms';
import { createBiomeSplatUniforms } from './biomeSplatUniforms';

export type { TerrainSplatUniforms } from './biomeSplatUniforms';

export type TerrainSplatMaterial = MeshBasicNodeMaterial & {
  terrainUniforms: TerrainSplatUniforms;
  macroHeight: MacroHeightTsl;
};

export interface BiomeSplatMaterialOptions extends BiomeSplatTextures {
  /** Omit vertex displacement shader path when false (default true — GPU height + chisel). */
  vertexDisplacement?: boolean;
  /**
   * Editor: albedo splat + hue-split (no AO atlas / shadows / glow). Play omits
   * (default false).
   */
  simpleShading?: boolean;
}

export function createTerrainSplatMaterial(
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  options: BiomeSplatMaterialOptions,
): TerrainSplatMaterial {
  const vertexDisplacement = options.vertexDisplacement ?? true;
  const simpleShading = options.simpleShading ?? false;
  const { uniforms, sunShadow } = createBiomeSplatUniforms(sun, options, {
    receiveSunShadow: !simpleShading,
  });

  const {
    positionNode,
    vSurfaceWorldXZ,
    chiseledWorldNormalAtWorldXZ,
    knifeWorldNormalAtWorldXZ,
    chiseledFaceCentroidXZAtWorldXZ,
    chiseledWorldYAtWorldXZ,
    macroSlopeAtWorldXZ,
    macroHeight,
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
    knifeWorldNormalAtWorldXZ,
    chiseledFaceCentroidXZAtWorldXZ,
    chiseledWorldYAtWorldXZ,
    macroSlopeAtWorldXZ,
    simpleShading,
  });

  const material = new MeshBasicNodeMaterial() as TerrainSplatMaterial;
  material.lights = false;
  material.positionNode = positionNode;
  material.castShadowPositionNode = positionLocal;
  material.colorNode = colorNode;
  material.terrainUniforms = uniforms;
  material.macroHeight = macroHeight;

  return material;
}
