// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/clouds/volumetric/cloudRaymarchTsl.ts — horizontal-slab raymarch core
import { Color, Vector3 } from 'three';
import {
  abs,
  exp,
  float,
  max,
  min,
  mix,
  normalize,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import {
  type CloudDensityUniforms,
  sampleCloudDensityDebug,
  sampleCloudDensityMarch,
} from './cloudDensityTsl';
import { getLiveVolumetricCloudParams } from './volumetricCloudDevState';
import { marchBlueNoiseJitter } from './cloudMarchJitterTsl';

type TslNode = any;

export interface CloudRaymarchUniforms {
  density: CloudDensityUniforms;
  uAbsorption: ReturnType<typeof uniform>;
  uSunDir: ReturnType<typeof uniform>;
  uSunColor: ReturnType<typeof uniform>;
  uAmbientColor: ReturnType<typeof uniform>;
  uCloudTint: ReturnType<typeof uniform>;
  /** March step jitter strength (0 = off). */
  uMarchJitter: ReturnType<typeof uniform>;
  /** 0 = march, 1 = slab hit magenta, 2 = mid-ray density grayscale */
  uMarchDebug: ReturnType<typeof uniform>;
}

export function createCloudRaymarchUniforms(
  density: CloudDensityUniforms,
): CloudRaymarchUniforms {
  const live = getLiveVolumetricCloudParams();
  return {
    density,
    uAbsorption: uniform(live.absorption),
    uSunDir: uniform(new Vector3(0.3, 0.8, 0.5).normalize()),
    uSunColor: uniform(new Color(0xfff8e7)),
    uAmbientColor: uniform(new Color(0xb0c4de)),
    uCloudTint: uniform(new Color(0xffffff)),
    uMarchJitter: uniform(live.marchJitter),
    uMarchDebug: uniform(0),
  };
}

/**
 * Inline slab raymarch — composed inside the post composite Fn (not wrapped in Fn()).
 * uMarchDebug: 0 = density march, 1 = slab hit magenta, 2 = mid-ray density preview.
 */
export function marchCloudSlab(
  rayOrigin: TslNode,
  rayDir: TslNode,
  tSceneMax: TslNode,
  screenUv: TslNode,
  u: CloudRaymarchUniforms,
): TslNode {
  const ro = vec3(rayOrigin);
  const rd = normalize(vec3(rayDir));
  const rdY = rd.y;
  const eps = float(1e-4);
  const rdSign = rdY.greaterThanEqual(0).select(float(1), float(-1));
  const rdSafe = rdY.add(eps.mul(rdSign));

  const tA = u.density.uCloudBaseY.sub(ro.y).div(rdSafe);
  const tB = u.density.uCloudTopY.sub(ro.y).div(rdSafe);
  const tNear = min(tA, tB);
  const tFar = max(tA, tB);

  const inSlab = ro.y
    .greaterThanEqual(u.density.uCloudBaseY)
    .and(ro.y.lessThanEqual(u.density.uCloudTopY));
  const parallel = abs(rdY).lessThan(eps);

  const tEnter = float(0).toVar();
  const tEnd = float(0).toVar();
  tEnter.assign(parallel.select(inSlab.select(float(0), float(0)), max(tNear, float(0))));
  tEnd.assign(parallel.select(inSlab.select(tSceneMax, float(0)), min(tFar, tSceneMax)));

  const span = max(tEnd.sub(tEnter), float(0));
  const activeRay = tEnter.lessThan(tEnd).and(span.greaterThan(0.001));
  const rayMask = activeRay.select(float(1), float(0));
  const slabDebug = u.uMarchDebug.greaterThan(0.5).and(u.uMarchDebug.lessThan(1.5));
  const densityDebug = u.uMarchDebug.greaterThan(1.5);
  const slabHit = vec4(1, 0.2, 1, rayMask);

  const accum = vec3(0).toVar();
  const transmittance = float(1).toVar();
  const marchSteps = getLiveVolumetricCloudParams().maxSteps;
  const stepSize = span.div(float(marchSteps));
  const sunDirN = normalize(u.uSunDir);

  for (let i = 0; i < marchSteps; i++) {
    const stepIndex = float(i);
    const jitter = marchBlueNoiseJitter(screenUv, stepIndex, u.uMarchJitter);
    const t = tEnter.add(stepSize.mul(stepIndex.add(0.5).add(jitter)));
    const alive = transmittance.greaterThan(0.04);
    const on = t.lessThan(tEnd).and(activeRay).and(alive).select(float(1), float(0));
    const p = ro.add(rd.mul(t));
    const density = sampleCloudDensityMarch(p, u.density).mul(on);
    const sampleAlpha = float(1).sub(exp(density.negate().mul(stepSize).mul(u.uAbsorption)));

    const sunDot = max(rd.dot(sunDirN), float(0));
    const viewUp = max(rd.y, float(0));
    const sunLit = float(0.22).add(sunDot.mul(0.72));
    const underside = float(1).sub(viewUp.mul(0.28));
    const cloudRgb = mix(u.uAmbientColor, u.uSunColor, sunLit).mul(u.uCloudTint).mul(underside);

    accum.addAssign(cloudRgb.mul(sampleAlpha).mul(transmittance));
    transmittance.mulAssign(float(1).sub(sampleAlpha));
  }

  const alpha = float(1).sub(transmittance).mul(rayMask);
  const cloudRgb = accum.div(max(alpha, float(0.001)));
  const marched = vec4(cloudRgb, alpha);

  const tMid = tEnter.add(span.mul(0.5));
  const pMid = ro.add(rd.mul(tMid));
  const shaped = sampleCloudDensityDebug(pMid, u.density);
  const densityHit = vec4(vec3(shaped), rayMask);

  return densityDebug.select(densityHit, slabDebug.select(slabHit, marched));
}
