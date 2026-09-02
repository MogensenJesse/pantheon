// src/world/terrain/tsl/snowDistributionTsl.ts — height/noise/aspect snow weight (GPU)
//
// Caller must pass per-facet samples: centroid XZ, centroid chisel Y / HEIGHT_SCALE, and
// knife face N (not the crease fillet). Steep-face cancel vs slope-rock is applied by the
// splat compositor.
import { clamp, dot, float, If, mix, smoothstep, triNoise3D, vec3 } from 'three/tsl';
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
    uSnowReferenceSunDir,
    uSnowMountainWeight,
    uSnowHeightStart,
  } = uniforms as any;

  const snowW = float(0).toVar();
  const snowStartPad = uSnowMountainWeight.mul(0.12);
  const snowFloor = uSnowHeightStart.sub(snowStartPad);
  If(heightNorm.add(uSnowNoiseAmplitude).greaterThanEqual(snowFloor), () => {
    const noise = triNoise3D(
      vec3(worldXZ.x.mul(uSnowNoiseScale), float(0), worldXZ.y.mul(uSnowNoiseScale)),
      float(0.2),
      float(0),
    );
    const heightEff = heightNorm.add(noise.sub(0.5).mul(2).mul(uSnowNoiseAmplitude));
    const w = computeSnowWeightBase(uniforms, hwUsed, heightEff);

    const exposure = clamp(dot(worldNormal, uSnowReferenceSunDir), 0, 1);
    const aspectMul = mix(
      float(1).add(uSnowAspectShadeBoost),
      float(1).sub(uSnowAspectStrength),
      exposure,
    );
    snowW.assign(clamp(w.mul(aspectMul), 0, 1));
  });
  return snowW;
}
