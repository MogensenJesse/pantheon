// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassShadowTsl.ts — real-time sun shadow on grass albedo (matches terrain splat)
import { float, mix, smoothstep } from 'three/tsl';

/**
 * Apply sun shadow visibility with soft floor (1 = lit, floor = minimum in full shadow).
 * Gated by uSunIntensity so shadows fade out when the sun is down (terrain only darkens sun terms).
 */
export function applyGrassSunShadow(color, sunShadow, uShadowFloor, uSunIntensity) {
  const sunVis = float(sunShadow.r);
  const sunVisFloor = mix(uShadowFloor, float(1), sunVis);
  const sunWeight = smoothstep(float(0), float(0.05), uSunIntensity);
  const effectiveFloor = mix(float(1), sunVisFloor, sunWeight);
  return color.mul(effectiveFloor);
}
