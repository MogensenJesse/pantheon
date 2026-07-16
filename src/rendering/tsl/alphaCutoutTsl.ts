// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/tsl/alphaCutoutTsl.ts — hardened MASK alpha + optional hashed cutout
import { float, fract, mix, screenCoordinate, smoothstep, step } from 'three/tsl';

type AlphaCutoutScalar = number | ReturnType<typeof float>;

function alphaCutoutScalar(value: AlphaCutoutScalar) {
  return typeof value === 'number' ? float(value) : value;
}

/** Interleaved gradient noise in [0,1] from pixel coords (stable; no dFdx). */
function interleavedGradientNoise() {
  const n = screenCoordinate.x
    .mul(0.06711056)
    .add(screenCoordinate.y.mul(0.00583715));
  return fract(fract(n).mul(52.9829189));
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
 * Blend hardened MASK cutout with screen-space hashed alpha.
 * strength 0 = hardened only; 1 = full hash. Near-opaque texels always pass
 * so solid leaf interiors cannot vanish if noise misbehaves.
 */
export function hashedAlphaCutoutNode(
  alpha,
  alphaTest: AlphaCutoutScalar,
  alphaCutoffSharpness: AlphaCutoutScalar,
  hashStrength: AlphaCutoutScalar,
) {
  const hard = hardenedAlphaCutoutNode(alpha, alphaTest, alphaCutoffSharpness);
  const noise = interleavedGradientNoise();
  // Keep when alpha >= noise; force-keep near-opaque interiors.
  const hashed = step(noise, alpha).max(step(float(0.99), alpha));
  return mix(hard, hashed, alphaCutoutScalar(hashStrength));
}
