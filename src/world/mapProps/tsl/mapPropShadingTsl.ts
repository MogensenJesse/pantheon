// src/world/mapProps/tsl/mapPropShadingTsl.ts — day/night + softened sun shadow on prop albedo
import { float, length, mix, normalWorld, smoothstep, vec3 } from 'three/tsl';
import { playerGlowFalloff } from '../../../rendering/playerGlowTsl';
import { computePropSunShadowMul } from '../../../rendering/sunShadow';
import { applyFoliageWrapHemisphere } from '../../../rendering/tsl/foliageWrapHemisphereTsl';
import { propShadowUniforms } from '../config/mapPropShadowUniforms';
import { applyPropGroundContactTsl } from './propGroundContactTsl';

type TslNode = any;

/**
 * Unlit prop albedo with optional wrap diffuse + hemisphere, ground contact,
 * night dimming, partial sun shadow, and player glow.
 */
export function applyPropShading(
  albedo: TslNode,
  sunShadow: TslNode,
  positionWorld: TslNode,
  categoryMul: TslNode,
  contactCategoryMul: TslNode,
): TslNode {
  const {
    uShadowFloor,
    uSunIntensity,
    uSunDirection,
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    uShadowStrength,
    uWrapStrength,
    uHemisphereStrength,
    uSkyTint,
    uGroundTint,
    uPlayerPosition,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  } = propShadowUniforms as any;

  const shapedAlbedo = (applyFoliageWrapHemisphere as any)(
    albedo,
    normalWorld,
    uSunDirection,
    uWrapStrength,
    uHemisphereStrength,
    uSkyTint,
    uGroundTint,
    categoryMul,
  );

  const groundedAlbedo = applyPropGroundContactTsl(
    shapedAlbedo,
    positionWorld,
    contactCategoryMul,
    propShadowUniforms,
  );

  const dayT = smoothstep(uNightSkyDaylight, float(1), uDaylight);
  const nightMul = mix(uNightColorFloor, float(1), dayT);

  const shadowMul = (computePropSunShadowMul as any)(
    sunShadow,
    uShadowFloor,
    uSunIntensity,
    uShadowStrength,
  );

  const baseLit = groundedAlbedo.mul(nightMul).mul(shadowMul);

  const toPlayer = vec3(
    positionWorld.x.sub(uPlayerPosition.x),
    float(0),
    positionWorld.z.sub(uPlayerPosition.z),
  );
  const dist = length(toPlayer);
  const glow = playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul);
  const glowLit = groundedAlbedo.mul(glow);

  return baseLit.add(glowLit);
}
