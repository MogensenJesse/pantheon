// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/terrain/tsl/terrainSurfaceHeightTsl.ts — chiseled surface Y (shared with grass)
import { Fn, vec3 } from 'three/tsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';
import { createMacroHeightTsl, type MacroHeightTsl } from './terrainMacroHeightTsl';

export interface TerrainSurfaceHeightInputs {
  uniforms: TerrainSplatUniforms;
  /** Reuse splat material macro-height Fns when provided. */
  macroHeight?: MacroHeightTsl;
}

export function createTerrainSurfaceHeightTsl(inputs: TerrainSurfaceHeightInputs) {
  const { uniforms, macroHeight } = inputs;
  const {
    sampleHeightNormAtWorldXZ,
    macroWorldYAtWorldXZ,
    macroNormalAtWorldXZ,
    chiseledWorldYAtWorldXZ,
  } = macroHeight ?? createMacroHeightTsl(uniforms);

  const sampleTerrainSurfacePosition = Fn(([worldXZ]) =>
    vec3(worldXZ.x, chiseledWorldYAtWorldXZ(worldXZ), worldXZ.y),
  );

  const sampleTerrainSurfaceY = Fn(([worldXZ]) => sampleTerrainSurfacePosition(worldXZ).y);

  return {
    sampleTerrainSurfaceY,
    sampleTerrainSurfacePosition,
    sampleHeightNormAtWorldXZ,
    macroNormalAtWorldXZ,
    macroWorldYAtWorldXZ,
  };
}
