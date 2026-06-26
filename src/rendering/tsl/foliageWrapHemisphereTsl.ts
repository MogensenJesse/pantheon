// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/tsl/foliageWrapHemisphereTsl.ts — wrap half-Lambert + sky/ground hemisphere
import { dot, float, mix, normalize, vec3 } from 'three/tsl';

export interface FoliageWrapHemisphereUniforms {
  uSunDirection: { value: { x: number; y: number; z: number } };
  uWrapStrength: { value: number };
  uHemisphereStrength: { value: number };
  uSkyTint: { value: { r: number; g: number; b: number } };
  uGroundTint: { value: { r: number; g: number; b: number } };
}

/** Albedo × wrap diffuse × hemisphere ambient (shared by props, grass, flowers). */
export function applyFoliageWrapHemisphere(
  albedo,
  normal,
  uniforms: FoliageWrapHemisphereUniforms,
  categoryMul = 1,
) {
  const { uSunDirection, uWrapStrength, uHemisphereStrength, uSkyTint, uGroundTint } = uniforms;

  const n = normalize(normal);
  const halfLambert = dot(n, uSunDirection).mul(0.5).add(0.5);
  const wrapMix = uWrapStrength.mul(categoryMul);
  const wrapTerm = mix(float(1), halfLambert, wrapMix);

  const hemiT = n.y.mul(0.5).add(0.5);
  const hemiColor = mix(uGroundTint, uSkyTint, hemiT);
  const hemiMix = uHemisphereStrength.mul(categoryMul);
  const hemiTerm = mix(vec3(1), hemiColor, hemiMix);

  return albedo.mul(wrapTerm).mul(hemiTerm);
}
