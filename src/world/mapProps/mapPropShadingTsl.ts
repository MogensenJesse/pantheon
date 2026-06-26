// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/mapProps/mapPropShadingTsl.ts — day/night + softened sun shadow on prop albedo
import { float, length, mix, normalWorld, smoothstep, vec3 } from 'three/tsl';
import { playerGlowFalloff } from '../../rendering/playerGlowTsl';
import { computePropSunShadowMul } from '../../rendering/sunShadow';
import { applyFoliageWrapHemisphere } from '../../rendering/tsl/foliageWrapHemisphereTsl';
import type { PropShadowUniforms } from './mapPropShadowUniforms';

/**
 * Unlit prop albedo with optional wrap diffuse + hemisphere, night dimming,
 * partial sun shadow, and player glow.
 */
export function applyPropShading(
  albedo,
  sunShadow,
  positionWorld,
  uniforms: PropShadowUniforms,
  categoryMul,
) {
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

  const shapedAlbedo = applyFoliageWrapHemisphere(albedo, normalWorld, uniforms, categoryMul);

  const dayT = smoothstep(uNightSkyDaylight, float(1), uDaylight);
  const nightMul = mix(uNightColorFloor, float(1), dayT);

  const shadowMul = computePropSunShadowMul(
    sunShadow,
    uShadowFloor,
    uSunIntensity,
    uShadowStrength,
    uShadowSmoothMin,
    uShadowSmoothMax,
  );

  const baseLit = shapedAlbedo.mul(nightMul).mul(shadowMul);

  const toPlayer = vec3(
    positionWorld.x.sub(uPlayerPosition.x),
    float(0),
    positionWorld.z.sub(uPlayerPosition.z),
  );
  const dist = length(toPlayer);
  const glow = playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul);
  const glowLit = shapedAlbedo.mul(nightMul).mul(glow);

  return baseLit.add(glowLit);
}
