// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/tsl/terrainClipmapOpacityTsl.ts — circular clipmap visibility + detail disp fade
import { Fn, float, length, smoothstep, step } from 'three/tsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

export function createTerrainClipmapTsl(uniforms: TerrainSplatUniforms) {
  const { uDetailPatchOrigin, uDetailRadiusM, uDetailDispFadeStartM } = uniforms;

  const detailDiskDistanceM = Fn(([worldXZ]) => length(worldXZ.sub(uDetailPatchOrigin)));

  /** 1 at center, 0 at/ beyond detailRadiusM. */
  const detailDispRadialWeight = Fn(([worldXZ]) => {
    const dist = detailDiskDistanceM(worldXZ);
    return float(1).sub(smoothstep(uDetailDispFadeStartM, uDetailRadiusM, dist));
  });

  /** Detail disk: visible inside the circle. */
  const detailDiskOpacity = Fn(([worldXZ]) =>
    float(1).sub(step(uDetailRadiusM, detailDiskDistanceM(worldXZ))),
  );

  return {
    detailDispRadialWeight,
    detailDiskOpacity,
  };
}

export type TerrainClipmapTsl = ReturnType<typeof createTerrainClipmapTsl>;
