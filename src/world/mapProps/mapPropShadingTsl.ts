// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/mapProps/mapPropShadingTsl.ts — day/night + softened sun shadow on prop albedo
import { float, length, mix, smoothstep, vec3 } from 'three/tsl';
import { playerGlowFalloff } from '../../rendering/playerGlowTsl';
import type { PropShadowUniforms } from './mapPropShadowUniforms';

/**
 * Unlit prop albedo with night dimming, partial sun shadow (not full multiply), and player glow.
 * Shadow is smoothed and scaled to reduce PCF shimmer on alpha-cutout foliage.
 */
export function applyPropShading(albedo, sunShadow, positionWorld, uniforms: PropShadowUniforms) {
  const {
    uShadowFloor,
    uSunIntensity,
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    uShadowStrength,
    uShadowSmoothMin,
    uShadowSmoothMax,
    uPlayerPosition,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  } = uniforms;

  const dayT = smoothstep(uNightSkyDaylight, float(1), uDaylight);
  const nightMul = mix(uNightColorFloor, float(1), dayT);

  const sunVis = smoothstep(uShadowSmoothMin, uShadowSmoothMax, float(sunShadow.r));
  const sunVisFloor = mix(uShadowFloor, float(1), sunVis);
  const sunWeight = smoothstep(float(0), float(0.05), uSunIntensity);
  const shadowMul = mix(float(1), sunVisFloor, sunWeight.mul(uShadowStrength));

  const baseLit = albedo.mul(nightMul).mul(shadowMul);

  const toPlayer = vec3(positionWorld.x.sub(uPlayerPosition.x), float(0), positionWorld.z.sub(uPlayerPosition.z));
  const dist = length(toPlayer);
  const glow = playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul);
  const glowLit = albedo.mul(nightMul).mul(glow);

  return baseLit.add(glowLit);
}
