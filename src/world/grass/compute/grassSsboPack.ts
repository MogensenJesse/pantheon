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
import type { TslNode } from '../tsl/tslNode';

const MASK12 = uint(0xfff);

/** Exact float tile offsets (no quant jitter). */
export function packOffsetX(offsetX: TslNode): TslNode {
  return floatBitsToUint(offsetX);
}

export function packOffsetZ(offsetZ: TslNode): TslNode {
  return floatBitsToUint(offsetZ);
}

export function unpackOffsetX(word: TslNode): TslNode {
  return uintBitsToFloat(word);
}

export function unpackOffsetZ(word: TslNode): TslNode {
  return uintBitsToFloat(word);
}

/** word z: heightNorm (16, high 16 bits; low bits unused) */
export function packHeightWord(heightNorm: TslNode): TslNode {
  return shiftLeft(encodeHeight16(heightNorm), 16);
}

export function unpackHeightNorm(word: TslNode): TslNode {
  return decodeHeight16(shiftRight(word, 16));
}

export function unpackTerrainY(word: TslNode, heightScale: TslNode, surfaceBias: TslNode): TslNode {
  return unpackHeightNorm(word).mul(heightScale).add(surfaceBias);
}

/** word w: visibility (8) | currentScale (12) | originalScale (12) */
export function packStateWord(
  visByte: TslNode,
  currentScale: TslNode,
  originalScale: TslNode,
  currentScaleMin: TslNode,
  currentScaleSpan: TslNode,
  originalScaleMin: TslNode,
  originalScaleSpan: TslNode,
): TslNode {
  const vis = uint(visByte);
  const sc = encodeScale12(currentScale, currentScaleMin, currentScaleSpan);
  const so = encodeScale12(originalScale, originalScaleMin, originalScaleSpan);
  return vis.add(shiftLeft(uint(sc), 8)).add(shiftLeft(uint(so), 20));
}

export function encodeVisBool(visibility: TslNode): TslNode {
  return uint(visibility.greaterThan(0.5).select(255, 0));
}

export function unpackVisByte(word: TslNode): TslNode {
  return bitAnd(word, uint(0xff));
}

export function unpackCurrentScale(word: TslNode, scaleMin: TslNode, scaleSpan: TslNode): TslNode {
  return decodeScale12(bitAnd(uint(shiftRight(word, 8)), MASK12), scaleMin, scaleSpan);
}

export function unpackOriginalScale(word: TslNode, scaleMin: TslNode, scaleSpan: TslNode): TslNode {
  return decodeScale12(bitAnd(uint(shiftRight(word, 20)), MASK12), scaleMin, scaleSpan);
}

function encodeHeight16(heightNorm: TslNode): TslNode {
  return uint(heightNorm.clamp(0, 1).mul(65535).floor());
}

function decodeHeight16(encoded: TslNode): TslNode {
  return encoded.toFloat().div(65535);
}

function encodeScale12(scale: TslNode, scaleMin: TslNode, scaleSpan: TslNode): TslNode {
  const t = scale.sub(scaleMin).div(max(scaleSpan, EPSILON)).clamp();
  return uint(t.mul(4095).floor());
}

function decodeScale12(encoded: TslNode, scaleMin: TslNode, scaleSpan: TslNode): TslNode {
  const t = encoded.toFloat().div(4095);
  return t.mul(scaleSpan).add(scaleMin);
}
