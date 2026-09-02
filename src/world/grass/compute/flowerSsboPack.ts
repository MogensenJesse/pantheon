// src/world/grass/compute/flowerSsboPack.ts — uint: heightNorm 16 | vis 1 | debug reason 8
import { bitAnd, shiftLeft, shiftRight, uint } from 'three/tsl';
import type { TslNode } from '../tsl/tslNode';

const VIS_BIT = uint(1 << 16);
const REASON_SHIFT = 17;
const REASON_MASK = uint(0xff);

export function packFlowerWord(
  heightNorm: TslNode,
  visibility: TslNode,
  debugReason: TslNode,
): TslNode {
  const height = uint(heightNorm.clamp(0, 1).mul(65535).floor());
  const vis = visibility.greaterThan(0.5).select(VIS_BIT, uint(0));
  const reason = shiftLeft(bitAnd(uint(debugReason), REASON_MASK), REASON_SHIFT);
  return height.add(vis).add(reason);
}

export function unpackFlowerVisibility(word: TslNode): TslNode {
  return bitAnd(uint(word), VIS_BIT).greaterThan(uint(0)).select(uint(1), uint(0)).toFloat();
}

export function unpackFlowerDebugReason(word: TslNode): TslNode {
  return bitAnd(uint(shiftRight(word, REASON_SHIFT)), REASON_MASK).toFloat();
}

export function unpackFlowerTerrainY(
  word: TslNode,
  heightScale: TslNode,
  surfaceBias: TslNode,
): TslNode {
  return bitAnd(uint(word), uint(0xffff)).toFloat().div(65535).mul(heightScale).add(surfaceBias);
}
