// src/world/terrain/tsl/terrainMacroHeightTsl.ts — GPU macro height + normal from sculpt height map
import { Fn, float, mix, normalize, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

type TslNode = any;

/** World-space macro height sampling from the sculpt grid texture. */
export function createMacroHeightTsl(uniforms: TerrainSplatUniforms) {
  const { uHeightTex, uHeightScale, uWorldSize, uHeightNormalStep } = uniforms as any;

  const sampleHeightNormAtWorldXZ = Fn(
    ([worldXZ]: TslNode[]) => uHeightTex.sample(terrainMapUv(uWorldSize, worldXZ)).r,
  );

  const macroWorldYAtWorldXZ = Fn(([worldXZ]: TslNode[]) =>
    sampleHeightNormAtWorldXZ(worldXZ).mul(uHeightScale),
  );

  /**
   * Central-difference macro normal at height-grid spacing (~1 m).
   * Shared by fine + coarse play layers so slope-rock agrees across the detail ring.
   */
  const macroNormalAtWorldXZ = Fn(([worldXZ]: TslNode[]) => {
    const gridStep = uHeightNormalStep;
    const twoStep = gridStep.mul(2);
    const hL = sampleHeightNormAtWorldXZ(worldXZ.sub(vec2(gridStep, 0)));
    const hR = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(gridStep, 0)));
    const hD = sampleHeightNormAtWorldXZ(worldXZ.sub(vec2(0, gridStep)));
    const hU = sampleHeightNormAtWorldXZ(worldXZ.add(vec2(0, gridStep)));
    const dx = hR.sub(hL).mul(uHeightScale).div(twoStep);
    const dz = hU.sub(hD).mul(uHeightScale).div(twoStep);
    const raw = normalize(vec3(dx.negate(), float(1), dz.negate()));
    const up = vec3(0, 1, 0);
    const flatBlend = smoothstep(float(0.92), float(0.99), raw.y);
    return normalize(mix(raw, up, flatBlend));
  });

  /**
   * Interpolate the coarse PlaneGeometry surface (after rotateX(-π/2)):
   * each quad is (00, +Z, +X) | (+Z, +X+Z, +X). Bilinear over the quad does not
   * match that diagonal, and the height gap reads as a sky slit on slopes.
   */
  const meshGridWorldYAtStep = Fn(([worldXZ, stepM]: TslNode[]) => {
    const inv = float(1).div(stepM);
    const origin = worldXZ.mul(inv).floor().mul(stepM);
    const t = worldXZ.mul(inv).fract();
    const y00 = macroWorldYAtWorldXZ(origin);
    const y10 = macroWorldYAtWorldXZ(origin.add(vec2(stepM, 0)));
    const y01 = macroWorldYAtWorldXZ(origin.add(vec2(0, stepM)));
    const y11 = macroWorldYAtWorldXZ(origin.add(vec2(stepM, stepM)));
    const yLower = y00.mul(float(1).sub(t.x).sub(t.y)).add(y01.mul(t.y)).add(y10.mul(t.x));
    const yUpper = y01
      .mul(float(1).sub(t.x))
      .add(y11.mul(t.x.add(t.y).sub(float(1))))
      .add(y10.mul(float(1).sub(t.y)));
    return mix(yLower, yUpper, step(float(1), t.x.add(t.y)));
  });

  const meshGridNormalAtStep = Fn(([worldXZ, stepM]: TslNode[]) => {
    const inv = float(1).div(stepM);
    const origin = worldXZ.mul(inv).floor().mul(stepM);
    const t = worldXZ.mul(inv).fract();
    const n00 = macroNormalAtWorldXZ(origin);
    const n10 = macroNormalAtWorldXZ(origin.add(vec2(stepM, 0)));
    const n01 = macroNormalAtWorldXZ(origin.add(vec2(0, stepM)));
    const n11 = macroNormalAtWorldXZ(origin.add(vec2(stepM, stepM)));
    const nLower = n00.mul(float(1).sub(t.x).sub(t.y)).add(n01.mul(t.y)).add(n10.mul(t.x));
    const nUpper = n01
      .mul(float(1).sub(t.x))
      .add(n11.mul(t.x.add(t.y).sub(float(1))))
      .add(n10.mul(float(1).sub(t.y)));
    return normalize(mix(nLower, nUpper, step(float(1), t.x.add(t.y))));
  });

  return {
    sampleHeightNormAtWorldXZ,
    macroWorldYAtWorldXZ,
    meshGridWorldYAtStep,
    meshGridNormalAtStep,
    macroNormalAtWorldXZ,
  };
}

export type MacroHeightTsl = ReturnType<typeof createMacroHeightTsl>;
