// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/tsl/terrainMacroHeightTsl.ts — GPU macro height + normal from sculpt height map
import { Fn, float, mix, normalize, smoothstep, vec2, vec3 } from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

/** World-space macro height sampling from the sculpt grid texture. */
export function createMacroHeightTsl(uniforms: TerrainSplatUniforms) {
  const { uHeightTex, uHeightScale, uWorldSize, uHeightNormalStep } = uniforms;

  const sampleHeightNormAtWorldXZ = Fn(
    ([worldXZ]) => uHeightTex.sample(terrainMapUv(uWorldSize, worldXZ)).r,
  );

  const macroWorldYAtWorldXZ = Fn(([worldXZ]) =>
    sampleHeightNormAtWorldXZ(worldXZ).mul(uHeightScale),
  );

  /**
   * Central-difference macro normal at mesh vertex spacing (~0.2 m play / ~0.8 m editor).
   * Matches old CPU `computeVertexNormals` on the baked mesh; sculpt-texel spacing was too coarse.
   */
  const macroNormalAtWorldXZ = Fn(([worldXZ]) => {
    const step = uHeightNormalStep;
    const twoStep = step.mul(2);
    const hL = sampleHeightNormAtWorldXZ(worldXZ.sub(vec2(step, 0)));
    const hR = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(step, 0)));
    const hD = sampleHeightNormAtWorldXZ(worldXZ.sub(vec2(0, step)));
    const hU = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(0, step)));
    const dx = hR.sub(hL).mul(uHeightScale).div(twoStep);
    const dz = hU.sub(hD).mul(uHeightScale).div(twoStep);
    const raw = normalize(vec3(dx.negate(), float(1), dz.negate()));
    const up = vec3(0, 1, 0);
    const flatBlend = smoothstep(float(0.92), float(0.99), raw.y);
    return normalize(mix(raw, up, flatBlend));
  });

  return { sampleHeightNormAtWorldXZ, macroWorldYAtWorldXZ, macroNormalAtWorldXZ };
}
