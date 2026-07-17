// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/tsl/alphaCutoutTsl.ts — hardened MASK alpha + optional hashed cutout
import { float, fract, mix, smoothstep, step } from 'three/tsl';

type AlphaCutoutScalar = number | ReturnType<typeof float>;

function alphaCutoutScalar(value: AlphaCutoutScalar) {
  return typeof value === 'number' ? float(value) : value;
}

/** Deterministic world/object-space noise in [0,1] that does not move with the camera. */
function stableSpatialNoise(position) {
  const n = position.x.mul(12.9898).add(position.y.mul(78.233)).add(position.z.mul(37.719));
  return fract(n.sin().mul(43758.5453));
}

/** smoothstep alpha that rejects soft fringe pixels before shading. */
export function hardenedAlphaCutoutNode(
  alpha,
  alphaTest: AlphaCutoutScalar,
  alphaCutoffSharpness: AlphaCutoutScalar,
) {
  const t = alphaCutoutScalar(alphaTest);
  const edge = t.add(alphaCutoutScalar(alphaCutoffSharpness));
  return smoothstep(t, edge, alpha);
}

/**
 * Blend hardened MASK cutout with spatially stable hashed alpha.
 * strength 0 = hardened only; 1 = full hash. Near-opaque texels always pass
 * so solid leaf interiors cannot vanish if noise misbehaves.
 */
export function hashedAlphaCutoutNode(
  alpha,
  alphaTest: AlphaCutoutScalar,
  alphaCutoffSharpness: AlphaCutoutScalar,
  hashStrength: AlphaCutoutScalar,
  stablePosition,
) {
  const hard = hardenedAlphaCutoutNode(alpha, alphaTest, alphaCutoffSharpness);
  const noise = stableSpatialNoise(stablePosition);
  // Keep when alpha >= noise; force-keep near-opaque interiors.
  const hashed = step(noise, alpha).max(step(float(0.99), alpha));
  return mix(hard, hashed, alphaCutoutScalar(hashStrength));
}
