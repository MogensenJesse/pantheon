// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/terrain/material/biomeSplatDisplacement.ts — vertex Y from height + chisel
import { Fn, positionLocal, varying, vec2, vec3 } from 'three/tsl';
import { macroSurfaceWorldXZ } from '../tsl/biomeAtlasUv';
import { createBiomeHeightWeights } from '../tsl/biomeSplatWeights';
import { createMacroHeightTsl } from '../tsl/terrainMacroHeightTsl';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

type TslNode = any;

export interface BiomeSplatDisplacementInputs {
  uniforms: TerrainSplatUniforms;
  /** When false, skip positionNode (CPU-baked mesh already has macro Y). */
  vertexDisplacement?: boolean;
}

export interface BiomeSplatDisplacementOutputs {
  /** Always set — captures macro surface XZ before height displace for texture UVs. */
  positionNode: TslNode;
  vSurfaceWorldXZ: TslNode;
  /** Fragment-space facet face N with crease fillet — do not interpolate; indexed 8 m verts sit on corners. */
  chiseledWorldNormalAtWorldXZ: TslNode;
  /** Knife-chisel world Y — waterline / wetness must use this, not bilinear height. */
  chiseledWorldYAtWorldXZ: TslNode;
  /** Smooth |∇h| from bilinear sculpt Y — shoreline width, not facet-face slope. */
  macroSlopeAtWorldXZ: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
  sampleHeightNormAtWorldXZ: TslNode;
  /** Shared with grass `createTerrainSurfaceHeightTsl` so the chisel graph is compiled once. */
  macroHeight: ReturnType<typeof createMacroHeightTsl>;
}

export function buildBiomeSplatDisplacement(
  inputs: BiomeSplatDisplacementInputs,
): BiomeSplatDisplacementOutputs {
  const { uniforms: splatUniforms, vertexDisplacement = true } = inputs;
  const uniforms = splatUniforms as any;

  // @ts-expect-error TSL varying node union exceeds TS representable complexity
  const vSurfaceWorldXZ: TslNode = varying(vec2());

  const macroHeight = createMacroHeightTsl(uniforms);
  const {
    sampleHeightNormAtWorldXZ,
    chiseledWorldYAtWorldXZ,
    chiseledWorldNormalAtWorldXZ,
    macroSlopeAtWorldXZ,
  } = macroHeight;

  const biomeHeightWeights = createBiomeHeightWeights(uniforms);

  /** Play path: CPU mesh already has macro Y in positionLocal — shader must not add it again. */
  const cpuBakedMacroPosition = Fn(() => {
    vSurfaceWorldXZ.assign(macroSurfaceWorldXZ());
    return positionLocal;
  });

  const displacedPosition = Fn(() => {
    const worldXZ = macroSurfaceWorldXZ();
    vSurfaceWorldXZ.assign(worldXZ);
    return vec3(positionLocal.x, chiseledWorldYAtWorldXZ(worldXZ), positionLocal.z);
  });

  return {
    positionNode: vertexDisplacement ? displacedPosition() : cpuBakedMacroPosition(),
    vSurfaceWorldXZ,
    chiseledWorldNormalAtWorldXZ,
    chiseledWorldYAtWorldXZ,
    macroSlopeAtWorldXZ,
    biomeHeightWeights,
    sampleHeightNormAtWorldXZ,
    macroHeight,
  };
}
