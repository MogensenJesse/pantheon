// src/world/terrain/tsl/biomeSplatWeights.ts — shared height/paint/snow weight helpers
import { Fn, float, mix, smoothstep, step, vec4 } from 'three/tsl';
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

/** Blend height-driven weights with painted biome map; fall back when paint sum is near zero. */
export function resolvePaintedHwUsed(
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>,
  heightNorm: TslNode,
  painted: TslNode,
  blendWidth: TslNode,
  useBiomeMap: TslNode,
) {
  const heightWeights = biomeHeightWeights(heightNorm, blendWidth);
  const hw = mix(heightWeights, painted, useBiomeMap);
  const hwSum = hw.x.add(hw.y).add(hw.z).add(hw.w);
  return mix(heightWeights, hw, step(0.001, hwSum));
}

export function computeSnowWeight(
  uniforms: TerrainSplatUniforms,
  heightNorm: TslNode,
  hwUsed: TslNode,
) {
  const { uSnowHeightStart, uSnowHeightEnd, uSnowMountainWeight } = uniforms as any;
  const snowStartPad = uSnowMountainWeight.mul(0.12);
  const snowEndPad = uSnowMountainWeight.mul(0.08);
  const heightSnow = smoothstep(
    uSnowHeightStart.sub(snowStartPad),
    uSnowHeightEnd.sub(snowEndPad),
    heightNorm,
  );
  return heightSnow.mul(mix(float(1), hwUsed.w, uSnowMountainWeight));
}
