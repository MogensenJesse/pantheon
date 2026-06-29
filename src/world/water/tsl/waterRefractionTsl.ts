// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/water/tsl/waterRefractionTsl.ts — screen-space refraction for shallow submerged terrain
import { float, mix, screenUV, viewportSafeUV, viewportSharedTexture } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { WaterShoreUniforms } from '../waterShoreUniforms';

/** Refraction blend weight from shallow transmit × strength. */
export function waterRefractionWeightTsl(transmitWeight: Node, shore: WaterShoreUniforms): Node {
  return transmitWeight.mul(shore.uRefractionStrength).mul(shore.uEnabled).clamp(0, 1);
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
export function waterRefractedSceneColorTsl(refractOffset: Node): Node {
  const uv = viewportSafeUV(screenUV.add(refractOffset));
  return viewportSharedTexture(uv).rgb;
}

/**
 * Replace shallow underwater view with refracted scene color (+ light shallow tint).
 * Shallow transmit → weight 1 shows distorted floor, not the static alpha passthrough.
 */
export function applyWaterRefractionTsl(
  surfaceColor: Node,
  refractOffset: Node,
  transmitWeight: Node,
  shallowTint: Node,
  shore: WaterShoreUniforms,
): Node {
  const refracted = waterRefractedSceneColorTsl(refractOffset);
  const weight = waterRefractionWeightTsl(transmitWeight, shore);
  const underwater = mix(refracted, shallowTint, float(0.18));
  return mix(surfaceColor, underwater, weight);
}

/**
 * Push opacity toward 1 when refracting so undistorted terrain does not alpha-blend through.
 */
export function waterRefractionOpacityCompensateTsl(
  opacity: Node,
  transmitWeight: Node,
  shore: WaterShoreUniforms,
): Node {
  const weight = waterRefractionWeightTsl(transmitWeight, shore);
  return mix(opacity, float(1), weight.mul(shore.uRefractionOpacity));
}
