// src/world/terrain/tsl/snowDistributionTsl.ts — height/noise/aspect/slope snow weight (GPU)
import { clamp, dot, float, mix, smoothstep, triNoise3D, vec3 } from 'three/tsl';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';

type TslNode = any;

function computeSnowWeightBase(
  uniforms: TerrainSplatUniforms,
  hwUsed: TslNode,
  heightEff: TslNode,
): TslNode {
  const { uSnowHeightStart, uSnowHeightEnd, uSnowMountainWeight } = uniforms as any;
  const snowStartPad = uSnowMountainWeight.mul(0.12);
  const snowEndPad = uSnowMountainWeight.mul(0.08);
  const heightSnow = smoothstep(
    uSnowHeightStart.sub(snowStartPad),
    uSnowHeightEnd.sub(snowEndPad),
    heightEff,
  );
  return heightSnow.mul(mix(float(1), hwUsed.w, uSnowMountainWeight));
}

export function computeSnowWeight(
  uniforms: TerrainSplatUniforms,
  heightNorm: TslNode,
  hwUsed: TslNode,
  worldXZ: TslNode,
  worldNormal: TslNode,
): TslNode {
  const {
    uSnowNoiseAmplitude,
    uSnowNoiseScale,
    uSnowAspectStrength,
    uSnowAspectShadeBoost,
    uSnowSlopeNormalYStart,
    uSnowSlopeNormalYEnd,
    uSnowSlopeStrength,
    uSnowReferenceSunDir,
  } = uniforms as any;

  const noise = triNoise3D(
    vec3(worldXZ.x.mul(uSnowNoiseScale), float(0), worldXZ.y.mul(uSnowNoiseScale)),
    float(0.2),
    float(0),
  );
  const heightEff = heightNorm.add(noise.sub(0.5).mul(2).mul(uSnowNoiseAmplitude));
  let snowW = computeSnowWeightBase(uniforms, hwUsed, heightEff);

  const exposure = clamp(dot(worldNormal, uSnowReferenceSunDir), 0, 1);
  const aspectMul = mix(
    float(1).add(uSnowAspectShadeBoost),
    float(1).sub(uSnowAspectStrength),
    exposure,
  );
  snowW = clamp(snowW.mul(aspectMul), 0, 1);

  const slopeMul = smoothstep(uSnowSlopeNormalYEnd, uSnowSlopeNormalYStart, worldNormal.y);
  const slopeFactor = mix(float(1), slopeMul, uSnowSlopeStrength);
  return snowW.mul(slopeFactor);
}
