// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/tsl/alphaCutoutTsl.ts — hardened MASK alpha for WebGPU cutout materials
import { float, smoothstep } from 'three/tsl';

type AlphaCutoutScalar = number | ReturnType<typeof float>;

function alphaCutoutScalar(value: AlphaCutoutScalar) {
  return typeof value === 'number' ? float(value) : value;
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
