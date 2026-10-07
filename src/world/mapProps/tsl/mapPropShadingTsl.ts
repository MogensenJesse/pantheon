// src/world/mapProps/tsl/mapPropShadingTsl.ts — day/night + softened sun shadow on prop albedo
import { float, length, mix, normalWorld, smoothstep, vec2, vec3 } from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';
import { playerGlowFalloff } from '../../../rendering/playerGlowTsl';
import { computePropSunShadowMul } from '../../../rendering/sunShadow';
import { applyFoliageWrapHemisphere } from '../../../rendering/tsl/foliageWrapHemisphereTsl';
import { guideReceiveGlowTsl } from '../../../rendering/tsl/guideReceiveGlowTsl';
import { propShadowUniforms } from '../config/mapPropShadowUniforms';
import { applyPropGroundContactTsl } from './propGroundContactTsl';

type TslNode = any;

/**
 * Unlit prop albedo with optional wrap diffuse + hemisphere, ground contact,
 * night dimming, partial sun shadow, key/fill light tint, and player glow.
 */
export function applyPropShading(
  albedo: TslNode,
  sunShadow: TslNode,
  positionWorld: TslNode,
  categoryMul: TslNode,
  contactCategoryMul: TslNode,
  /** World-space surface normal; animated meshes pass their own (default: the geometry normal). */
  normal: TslNode = normalWorld,
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
    uSunTint,
    uAmbientTint,
    uPlayerPosition,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uGuideGlowMap,
    uGuideLightIntensity,
    uWorldSize,
  } = propShadowUniforms as any;

  const shapedAlbedo = (applyFoliageWrapHemisphere as any)(
    albedo,
    normal,
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

  // Key/fill color: sun-lit side follows the sun tint, shadowed side the ambient tint.
  const keyFill = mix(uAmbientTint, uSunTint, shadowMul.clamp(0, 1));
  const baseLit = groundedAlbedo.mul(nightMul).mul(shadowMul).mul(keyFill);

  const toPlayer = vec3(
    positionWorld.x.sub(uPlayerPosition.x),
    float(0),
    positionWorld.z.sub(uPlayerPosition.z),
  );
  const dist = length(toPlayer);
  const glow = playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul);
  const guideUv = terrainMapUv(uWorldSize, vec2(positionWorld.x, positionWorld.z));
  const guideGlow = guideReceiveGlowTsl(uGuideGlowMap, guideUv, uGuideLightIntensity);
  const glowLit = groundedAlbedo.mul(glow.add(guideGlow));

  return baseLit.add(glowLit);
}
