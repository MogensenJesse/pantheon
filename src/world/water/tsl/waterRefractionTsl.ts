// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/water/tsl/waterRefractionTsl.ts — screen-space refraction for shallow submerged terrain
import { float, If, mix, screenUV, smoothstep, viewportSafeUV, viewportSharedTexture } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { waterBeerLambertAbsorptionTsl } from './waterDepthTsl';
import type { WaterShoreUniforms } from '../waterShoreUniforms';

// Re-export for materials — one shared node per material (three.js #32639).
export { viewportSharedTexture };

/** Refraction blend weight from independent depth mask × strength. */
export function waterRefractionWeightTsl(refractMask: Node, shore: WaterShoreUniforms): Node {
  return refractMask.mul(shore.uRefractionStrength).mul(shore.uEnabled).clamp(0, 1);
}

/**
 * Screen-space UV offset for submerged terrain refraction.
 * Stronger than reflection-UV distortion — viewport coords need larger deltas.
 */
export function waterRefractionScreenOffsetTsl(
  surfaceNormalXz: Node,
  distance: Node,
  distortionScale: Node,
  shore: WaterShoreUniforms,
): Node {
  const uvScale = float(0.028).mul(shore.uRefractionOffset);
  const distFalloff = float(1).div(distance.mul(0.06).add(1));
  const chop = distortionScale.mul(0.12).add(1);
  return surfaceNormalXz.mul(uvScale).mul(distFalloff).mul(chop);
}

/** Scene color behind the water fragment, UV-offset for surface refraction. */
export function waterRefractedSceneColorTsl(
  refractOffset: Node,
  viewportScene: Node,
): Node {
  const uv = viewportSafeUV(screenUV.add(refractOffset));
  return viewportScene.sample(uv).rgb;
}

/**
 * Replace shallow underwater view with refracted scene color (+ shallow tint).
 * Absorption only darkens the refracted sample — never replaces it with deep water color.
 */
export function applyWaterRefractionTsl(
  surfaceColor: Node,
  refractOffset: Node,
  refractMask: Node,
  shallowTint: Node,
  worldXZ: Node,
  shore: WaterShoreUniforms,
  viewportScene: Node,
): Node {
  const weight = waterRefractionWeightTsl(refractMask, shore);
  const absorb = waterBeerLambertAbsorptionTsl(worldXZ, shore);
  const result = surfaceColor.toVar('waterRefractOut');
  If(weight.greaterThan(float(0.001)), () => {
    const refracted = waterRefractedSceneColorTsl(refractOffset, viewportScene);
    const underwater = mix(refracted, shallowTint, float(0.18));
    const murk = mix(float(1), float(0.38), absorb);
    const murky = underwater.mul(murk);
    result.assign(mix(surfaceColor, murky, weight));
  });
  return result;
}

/**
 * Opacity: beer-lambert everywhere refraction is off; opaque when refracting so
 * absorption cannot re-introduce the sharp terrain pass-through.
 */
export function waterRefractionOpacityCompensateTsl(
  depthOpacity: Node,
  refractMask: Node,
  shore: WaterShoreUniforms,
): Node {
  const weight = waterRefractionWeightTsl(refractMask, shore);
  const lock = smoothstep(float(0.02), float(0.12), weight).mul(shore.uRefractionOpacity);
  return mix(depthOpacity, float(1), lock);
}
