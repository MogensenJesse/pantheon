// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/tsl/terrainMacroHeightTsl.ts — GPU macro height + normal from sculpt height map
import { Fn, float, normalize, vec2, vec3 } from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

/** World-space macro height sampling from the sculpt grid texture. */
export function createMacroHeightTsl(uniforms: TerrainSplatUniforms) {
  const { uHeightTex, uHeightScale, uWorldSize } = uniforms;

  const sampleHeightNormAtWorldXZ = Fn(
    ([worldXZ]) => uHeightTex.sample(terrainMapUv(uWorldSize, worldXZ)).r,
  );

  const macroWorldYAtWorldXZ = Fn(([worldXZ]) =>
    sampleHeightNormAtWorldXZ(worldXZ).mul(uHeightScale),
  );

  /** Finite-difference macro normal (1 m world step) — replaces flat-mesh normalWorld for slopes. */
  const macroNormalAtWorldXZ = Fn(([worldXZ]) => {
    const step = float(1);
    const h = sampleHeightNormAtWorldXZ(worldXZ);
    const hX = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(step, 0)));
    const hZ = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(0, step)));
    const dx = hX.sub(h).mul(uHeightScale);
    const dz = hZ.sub(h).mul(uHeightScale);
    return normalize(vec3(dx.negate(), float(1), dz.negate()));
  });

  return { sampleHeightNormAtWorldXZ, macroWorldYAtWorldXZ, macroNormalAtWorldXZ };
}
