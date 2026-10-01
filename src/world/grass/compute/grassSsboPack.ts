// src/world/grass/compute/grassSsboPack.ts — bit-packed uvec2 grass SSBO (8 B / instance)
import { bitAnd, shiftLeft, shiftRight, uint } from 'three/tsl';
import type { TslNode } from '../tsl/tslNode';

const MASK12 = uint(0xfff);

/** Absolute 12-bit scale range (meters). Default maxScale is 3. */
export const GRASS_SCALE_ABS_MAX = 4;

const HEIGHT_BITS = 23;
const HEIGHT_MAX = 2 ** HEIGHT_BITS - 1;
/** Signed height range (surfaceY / heightScale) the 23-bit field covers. */
const HEIGHT_NORM_MIN = -0.5;
const HEIGHT_NORM_SPAN = 2;

/** word x: cacheValid 1 | grassWeight 8 | heightNorm 23 (signed, [-0.5, 1.5]).
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
  return valid.add(shiftLeft(weight, 1)).add(shiftLeft(encodeHeight(heightNorm), 9));
}

export function unpackHeightNorm(word: TslNode): TslNode {
  return decodeHeight(shiftRight(uint(word), 9));
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

/** word y: vis (8: bit 0 kept | bits 1–7 DEV cull reason) | currentScale (12) | baseScale (12)
 *  — absolute 0–4 m. baseScale is the uncrushed target (random × transition × clump);
 *  current/base is the crush ratio.
 */
export function packStateWord(
  visByte: TslNode,
  currentScale: TslNode,
  baseScale: TslNode,
): TslNode {
  const vis = uint(visByte);
  const sc = encodeScale12(currentScale);
  const sb = encodeScale12(baseScale);
  return vis.add(shiftLeft(uint(sc), 8)).add(shiftLeft(uint(sb), 20));
}

/** Hysteresis bit (stochastic keep) plus the cull-debug reason, so debug never changes `kept`. */
export function encodeVisByte(kept: TslNode, reason: TslNode): TslNode {
  const keptBit = kept.greaterThan(0.5).select(uint(1), uint(0));
  return keptBit.add(shiftLeft(uint(reason.clamp(0, 127)), 1));
}

export function unpackVisKept(word: TslNode): TslNode {
  return bitAnd(uint(word), uint(1)).toFloat();
}

export function unpackVisReason(word: TslNode): TslNode {
  return bitAnd(uint(shiftRight(word, 1)), uint(0x7f)).toFloat();
}

export function unpackCurrentScale(word: TslNode): TslNode {
  return decodeScale12(bitAnd(uint(shiftRight(word, 8)), MASK12));
}

export function unpackBaseScale(word: TslNode): TslNode {
  return decodeScale12(bitAnd(uint(shiftRight(word, 20)), MASK12));
}

function encodeHeight(heightNorm: TslNode): TslNode {
  return uint(
    heightNorm
      .sub(HEIGHT_NORM_MIN)
      .div(HEIGHT_NORM_SPAN)
      .clamp(0, 1)
      .mul(HEIGHT_MAX)
      .add(0.5)
      .floor(),
  );
}

function decodeHeight(encoded: TslNode): TslNode {
  return encoded.toFloat().div(HEIGHT_MAX).mul(HEIGHT_NORM_SPAN).add(HEIGHT_NORM_MIN);
}

function encodeScale12(scale: TslNode): TslNode {
  return uint(scale.clamp(0, GRASS_SCALE_ABS_MAX).div(GRASS_SCALE_ABS_MAX).mul(4095).floor());
}

function decodeScale12(encoded: TslNode): TslNode {
  return encoded.toFloat().div(4095).mul(GRASS_SCALE_ABS_MAX);
}
