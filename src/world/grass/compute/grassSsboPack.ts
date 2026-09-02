// src/world/grass/compute/grassSsboPack.ts — bit-packed uvec2 grass SSBO (8 B / instance)
import { bitAnd, shiftLeft, shiftRight, uint } from 'three/tsl';
import type { TslNode } from '../tsl/tslNode';

const MASK12 = uint(0xfff);

/** Absolute 12-bit scale range (meters). Default maxScale is 3. */
export const GRASS_SCALE_ABS_MAX = 4;

/** word x: cacheValid 1 | grassWeight 8 | reserved 7 | heightNorm 16.
 *  Encode surfaceY / heightScale (macro + detail disp).
 *  Cache is valid until this instance wraps or `uInvalidateTerrainCache` is set.
 */
export function packHeightWord(
  heightNorm: TslNode,
  grassWeight: TslNode,
  cacheValid: TslNode,
): TslNode {
  const valid = cacheValid.greaterThan(0.5).select(uint(1), uint(0));
  const weight = uint(grassWeight.clamp(0, 1).mul(255).floor());
  return valid.add(shiftLeft(weight, 1)).add(shiftLeft(encodeHeight16(heightNorm), 16));
}

export function unpackHeightNorm(word: TslNode): TslNode {
  return decodeHeight16(shiftRight(word, 16));
}

export function unpackGrassWeight(word: TslNode): TslNode {
  return bitAnd(uint(shiftRight(word, 1)), uint(0xff))
    .toFloat()
    .div(255);
}

export function unpackTerrainCacheValid(word: TslNode): TslNode {
  return bitAnd(uint(word), uint(1)).toFloat();
}

/** Clear cache-valid (bit 0); keep packed height and grass weight. */
export function clearTerrainCacheValid(word: TslNode): TslNode {
  return bitAnd(uint(word), uint(0xfffffffe));
}

export function unpackTerrainY(word: TslNode, heightScale: TslNode, surfaceBias: TslNode): TslNode {
  return unpackHeightNorm(word).mul(heightScale).add(surfaceBias);
}

/** word y: visibility (8) | currentScale (12) | originalScale (12) — absolute 0–4 m. */
export function packStateWord(
  visByte: TslNode,
  currentScale: TslNode,
  originalScale: TslNode,
): TslNode {
  const vis = uint(visByte);
  const sc = encodeScale12(currentScale);
  const so = encodeScale12(originalScale);
  return vis.add(shiftLeft(uint(sc), 8)).add(shiftLeft(uint(so), 20));
}

export function encodeVisBool(visibility: TslNode): TslNode {
  return uint(visibility.greaterThan(0.5).select(255, 0));
}

export function unpackVisByte(word: TslNode): TslNode {
  return bitAnd(word, uint(0xff));
}

export function unpackCurrentScale(word: TslNode): TslNode {
  return decodeScale12(bitAnd(uint(shiftRight(word, 8)), MASK12));
}

export function unpackOriginalScale(word: TslNode): TslNode {
  return decodeScale12(bitAnd(uint(shiftRight(word, 20)), MASK12));
}

function encodeHeight16(heightNorm: TslNode): TslNode {
  return uint(heightNorm.clamp(0, 1).mul(65535).floor());
}

function decodeHeight16(encoded: TslNode): TslNode {
  return encoded.toFloat().div(65535);
}

function encodeScale12(scale: TslNode): TslNode {
  return uint(scale.clamp(0, GRASS_SCALE_ABS_MAX).div(GRASS_SCALE_ABS_MAX).mul(4095).floor());
}

function decodeScale12(encoded: TslNode): TslNode {
  return encoded.toFloat().div(4095).mul(GRASS_SCALE_ABS_MAX);
}
