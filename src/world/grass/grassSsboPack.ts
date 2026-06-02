// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassSsboPack.ts — bit-packed uvec4 grass SSBO (16 B / instance, WGSL-aligned)
import {
  EPSILON,
  bitAnd,
  float,
  floatBitsToUint,
  max,
  shiftLeft,
  shiftRight,
  uint,
  uintBitsToFloat,
  vec2,
} from 'three/tsl';

const MASK8 = uint(0xff);
const MASK12 = uint(0xfff);
const WIND_PACK_MAX = float(1.25);

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

/** word: windX (8) | windZ (8) */
export function packWindWord(windX, windZ) {
  const wx = encodeWind8(windX);
  const wz = encodeWind8(windZ);
  return wx.add(shiftLeft(wz, 8));
}

export function unpackWindXZ(word) {
  const wx = decodeWind8(bitAnd(word, MASK8));
  const wz = decodeWind8(bitAnd(shiftRight(word, 8), MASK8));
  return vec2(wx, wz);
}

/** word: visibility (8) | currentScale (12) | originalScale (12) */
export function packStateWord(visibility, currentScale, originalScale, scaleMin, scaleSpan) {
  const vis = encodeVis8(visibility);
  const sc = encodeScale12(currentScale, scaleMin, scaleSpan);
  const so = encodeScale12(originalScale, scaleMin, scaleSpan);
  return vis.add(shiftLeft(sc, 8)).add(shiftLeft(so, 20));
}

export function unpackVisibility(word) {
  return decodeVis8(bitAnd(word, MASK8));
}

export function unpackCurrentScale(word, scaleMin, scaleSpan) {
  return decodeScale12(bitAnd(shiftRight(word, 8), MASK12), scaleMin, scaleSpan);
}

export function unpackOriginalScale(word, scaleMin, scaleSpan) {
  return decodeScale12(bitAnd(shiftRight(word, 20), MASK12), scaleMin, scaleSpan);
}

function encodeWind8(component) {
  const norm = component.div(WIND_PACK_MAX).mul(0.5).add(0.5).clamp();
  return uint(norm.mul(255).floor());
}

function decodeWind8(encoded) {
  const norm = encoded.toFloat().div(255);
  return norm.sub(0.5).mul(2).mul(WIND_PACK_MAX);
}

function encodeVis8(visibility) {
  return uint(visibility.clamp(0, 1).mul(255).floor());
}

function decodeVis8(encoded) {
  return encoded.toFloat().div(255);
}

function encodeScale12(scale, scaleMin, scaleSpan) {
  const t = scale.sub(scaleMin).div(max(scaleSpan, EPSILON)).clamp();
  return uint(t.mul(4095).floor());
}

function decodeScale12(encoded, scaleMin, scaleSpan) {
  const t = encoded.toFloat().div(4095);
  return t.mul(scaleSpan).add(scaleMin);
}
