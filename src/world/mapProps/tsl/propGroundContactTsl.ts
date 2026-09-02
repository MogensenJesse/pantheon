// src/world/mapProps/tsl/propGroundContactTsl.ts — chisel-Y ground contact darken + tint
import { float, mix, smoothstep, vec2 } from 'three/tsl';
import { createMacroHeightTsl } from '../../terrain/tsl/terrainMacroHeightTsl';
import type { PropShadowUniforms } from '../config/mapPropShadowUniforms';

type TslNode = any;

/** Darken and tint albedo near terrain contact — strength scaled per material category. */
export function applyPropGroundContactTsl(
  albedo: TslNode,
  positionWorld: TslNode,
  contactCategoryStrength: TslNode,
  uniforms: PropShadowUniforms,
): TslNode {
  const u = uniforms as any;
  const { chiseledWorldYAtWorldXZ } = createMacroHeightTsl(u);
  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const terrainY = chiseledWorldYAtWorldXZ(worldXZ);
  const heightAbove = positionWorld.y.sub(terrainY);
  const contactT = smoothstep(float(0), u.uFadeHeightM, heightAbove);
  const strength = contactCategoryStrength;

  const darkenFloor = float(1).sub(u.uDarkenMax.mul(strength));
  const darkMul = mix(darkenFloor, float(1), contactT);
  const tintAmt = float(1).sub(contactT).mul(u.uTintStrength).mul(strength);
  const tinted = (mix as (a: TslNode, b: TslNode, t: TslNode) => TslNode)(
    albedo,
    albedo.mul(u.uGroundTint as TslNode),
    tintAmt,
  );
  const withContact = tinted.mul(darkMul);

  return mix(albedo, withContact, u.uGroundContactEnabled);
}
