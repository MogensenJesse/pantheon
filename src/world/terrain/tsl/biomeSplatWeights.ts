// src/world/terrain/tsl/biomeSplatWeights.ts — shared height/paint/snow weight helpers
import { Fn, float, If, smoothstep, vec4 } from 'three/tsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

type TslNode = any;

export function createBiomeHeightWeights(uniforms: TerrainSplatUniforms) {
  const { uWaterMax, uShoreMax, uForestMax, uHillsMax } = uniforms as any;

  return Fn(([h, blend]: TslNode[]) => {
    const wShore = smoothstep(uWaterMax, uWaterMax.add(blend), h).mul(
      float(1).sub(smoothstep(uShoreMax.sub(blend), uShoreMax, h)),
    );
    const wForest = smoothstep(uShoreMax.sub(blend), uShoreMax, h).mul(
      float(1).sub(smoothstep(uForestMax.sub(blend), uForestMax, h)),
    );
    const wHills = smoothstep(uForestMax.sub(blend), uForestMax, h).mul(
      float(1).sub(smoothstep(uHillsMax.sub(blend), uHillsMax, h)),
    );
    const wRockH = smoothstep(uHillsMax.sub(blend), uHillsMax, h);
    const sum = wShore.add(wForest).add(wHills).add(wRockH).add(0.0001);
    return vec4(wShore, wForest, wHills, wRockH).div(sum);
  });
}

/** Painted biome map when its sum is live; height-band fallback only on empty paint. */
export function resolvePaintedHwUsed(
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>,
  heightNorm: TslNode,
  painted: TslNode,
  blendWidth: TslNode,
) {
  const paintedSum = painted.x.add(painted.y).add(painted.z).add(painted.w);
  const hwUsed = vec4(0).toVar();
  If(paintedSum.greaterThan(0.001), () => {
    hwUsed.assign(painted);
  }).Else(() => {
    hwUsed.assign(biomeHeightWeights(heightNorm, blendWidth));
  });
  return hwUsed;
}

export { computeSnowWeight } from './snowDistributionTsl';
