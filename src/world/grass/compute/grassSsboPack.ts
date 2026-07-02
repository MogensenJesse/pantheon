// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/compute/grassSsboPack.ts — bit-packed uvec4 grass SSBO (16 B / instance, WGSL-aligned)
import {
  bitAnd,
  EPSILON,
  floatBitsToUint,
  max,
  shiftLeft,
  shiftRight,
  uint,
  uintBitsToFloat,
} from 'three/tsl';

const MASK12 = uint(0xfff);

/** Exact float tile offsets (no quant jitter). */
export function packOffsetX(offsetX) {
  return floatBitsToUint(offsetX);
}

export function packOffsetZ(offsetZ) {
  return floatBitsToUint(offsetZ);
}

export function unpackOffsetX(word) {
  return uintBitsToFloat(word);
}

export function unpackOffsetZ(word) {
  return uintBitsToFloat(word);
}

/** word z: heightNorm (16, high 16 bits; low bits unused) */
export function packHeightWord(heightNorm) {
  return shiftLeft(encodeHeight16(heightNorm), 16);
}

export function unpackHeightNorm(word) {
  return decodeHeight16(shiftRight(word, 16));
}

export function unpackTerrainY(word, heightScale, surfaceBias) {
  return unpackHeightNorm(word).mul(heightScale).add(surfaceBias);
}

/** word w: visibility (8) | currentScale (12) | originalScale (12) */
export function packStateWord(visByte, currentScale, originalScale, scaleMin, scaleSpan) {
  const vis = uint(visByte);
  const sc = encodeScale12(currentScale, scaleMin, scaleSpan);
  const so = encodeScale12(originalScale, scaleMin, scaleSpan);
  return vis.add(shiftLeft(sc, 8)).add(shiftLeft(so, 20));
}

export function encodeVisBool(visibility) {
  return uint(visibility.greaterThan(0.5).select(255, 0));
}

export function unpackVisByte(word) {
  return bitAnd(word, uint(0xff));
}

export function unpackCurrentScale(word, scaleMin, scaleSpan) {
  return decodeScale12(bitAnd(shiftRight(word, 8), MASK12), scaleMin, scaleSpan);
}

export function unpackOriginalScale(word, scaleMin, scaleSpan) {
  return decodeScale12(bitAnd(shiftRight(word, 20), MASK12), scaleMin, scaleSpan);
}

function encodeHeight16(heightNorm) {
  return uint(heightNorm.clamp(0, 1).mul(65535).floor());
}

function decodeHeight16(encoded) {
  return encoded.toFloat().div(65535);
}

function encodeScale12(scale, scaleMin, scaleSpan) {
  const t = scale.sub(scaleMin).div(max(scaleSpan, EPSILON)).clamp();
  return uint(t.mul(4095).floor());
}

function decodeScale12(encoded, scaleMin, scaleSpan) {
  const t = encoded.toFloat().div(4095);
  return t.mul(scaleSpan).add(scaleMin);
}
