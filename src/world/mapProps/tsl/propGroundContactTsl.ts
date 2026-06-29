// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/mapProps/tsl/propGroundContactTsl.ts — terrain-height ground contact darken + tint
import { float, mix, smoothstep, vec2 } from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';
import type { PropShadowUniforms } from '../mapPropShadowUniforms';

function sampleTerrainWorldY(worldXZ, uniforms: PropShadowUniforms) {
  return uniforms.uHeightTex
    .sample(terrainMapUv(uniforms.uWorldSize, worldXZ))
    .r.mul(uniforms.uHeightScale);
}

/** Darken and tint albedo near terrain contact — strength scaled per material category. */
export function applyPropGroundContactTsl(
  albedo,
  positionWorld,
  contactCategoryStrength,
  uniforms: PropShadowUniforms,
) {
  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const terrainY = sampleTerrainWorldY(worldXZ, uniforms);
  const heightAbove = positionWorld.y.sub(terrainY);
  const contactT = smoothstep(float(0), uniforms.uFadeHeightM, heightAbove);
  const strength = contactCategoryStrength;

  const darkenFloor = float(1).sub(uniforms.uDarkenMax.mul(strength));
  const darkMul = mix(darkenFloor, float(1), contactT);
  const tintAmt = float(1).sub(contactT).mul(uniforms.uTintStrength).mul(strength);
  const tinted = mix(albedo, albedo.mul(uniforms.uGroundTint), tintAmt);
  const withContact = tinted.mul(darkMul);

  return mix(albedo, withContact, uniforms.uGroundContactEnabled);
}
