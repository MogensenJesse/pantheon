// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/sunShadow/sunShadowTsl.ts — shared sun shadow visibility TSL primitives
import { clamp, float, max, mix, smoothstep } from 'three/tsl';

/** Raw PCF visibility remapped to [shadowFloor, 1]. */
export function computeSunVisFloor(sunShadow, uShadowFloor) {
  const sunVis = float(sunShadow.r);
  return mix(uShadowFloor, float(1), sunVis);
}

/** Fade shadow contribution when sun intensity is near zero (reveal / night). */
export function computeSunShadowWeight(uSunIntensity) {
  return smoothstep(float(0), float(0.05), uSunIntensity);
}

/** Lit fraction for albedo multiply receivers (grass, water). */
export function computeEffectiveSunShadowFloor(sunShadow, uShadowFloor, uSunIntensity) {
  const sunVisFloor = computeSunVisFloor(sunShadow, uShadowFloor);
  const sunWeight = computeSunShadowWeight(uSunIntensity);
  return mix(float(1), sunVisFloor, sunWeight);
}

/**
 * Apply sun shadow visibility with soft floor (1 = lit, floor = minimum in full shadow).
 * Gated by uSunIntensity so shadows fade out when the sun is down.
 */
export function applySunShadowVisibility(color, sunShadow, uShadowFloor, uSunIntensity) {
  return color.mul(computeEffectiveSunShadowFloor(sunShadow, uShadowFloor, uSunIntensity));
}

/** Terrain sun diffuse/spec — ambient stays lit; no sun-intensity weight on the floor. */
export function computeTerrainSunVisFloor(sunShadow, uShadowFloor) {
  return computeSunVisFloor(sunShadow, uShadowFloor);
}

/** Prop albedo shadow multiplier — linear remap band + partial strength (PCSS softens edges). */
export function computePropSunShadowMul(
  sunShadow,
  uShadowFloor,
  uSunIntensity,
  uShadowStrength,
  uShadowSmoothMin,
  uShadowSmoothMax,
) {
  // Linear remap (not smoothstep): defaults [0,1] pass PCSS visibility through unchanged.
  // A tight band used to S-curve-boost midtones (~1.9×) and amplify residual shimmer.
  const span = max(uShadowSmoothMax.sub(uShadowSmoothMin), float(0.0001));
  const sunVis = clamp(float(sunShadow.r).sub(uShadowSmoothMin).div(span), float(0), float(1));
  const sunVisFloor = mix(uShadowFloor, float(1), sunVis);
  const sunWeight = computeSunShadowWeight(uSunIntensity);
  return mix(float(1), sunVisFloor, sunWeight.mul(uShadowStrength));
}
