// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/terrain/tsl/terrainSurfaceHeightTsl.ts — chiseled surface Y (shared with grass)
import { Fn } from 'three/tsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';
import { createMacroHeightTsl, type MacroHeightTsl } from './terrainMacroHeightTsl';

export interface TerrainSurfaceHeightInputs {
  uniforms: TerrainSplatUniforms;
  /** Reuse splat material macro-height Fns when provided. */
  macroHeight?: MacroHeightTsl;
}

export function createTerrainSurfaceHeightTsl(inputs: TerrainSurfaceHeightInputs) {
  const { uniforms, macroHeight } = inputs;
  const { chiseledWorldYAtWorldXZ } = macroHeight ?? createMacroHeightTsl(uniforms);

  const sampleTerrainSurfaceY = Fn(([worldXZ]) => chiseledWorldYAtWorldXZ(worldXZ));

  return { sampleTerrainSurfaceY };
}
