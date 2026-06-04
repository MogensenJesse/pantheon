// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/flowers/flowerSsboPack.ts — vec4.z packs height (12 bits) + visibility (1 bit)
import { EPSILON, clamp, float, floor, max, mod, pow, round, sub } from 'three/tsl';

const VIS_BIT_OFFSET = 12;

/** Pack world Y + visibility flag into vec4.z (Revo-style). */
export function packFlowerStateZ(yOffset, visibility, heightMax) {
  const levels = sub(pow(2, 12), 1);
  const lsb = heightMax.div(levels);
  const qRaw = yOffset.div(max(lsb, EPSILON));
  const q = clamp(round(qRaw), 0, levels);
  const heightPart = q.mul(pow(2, 0));
  const visPart = visibility.greaterThan(0.5).select(pow(2, VIS_BIT_OFFSET), float(0));
  return heightPart.add(visPart);
}

export function unpackFlowerHeight(z, heightMax) {
  const levels = sub(pow(2, 12), 1);
  const lsb = heightMax.div(levels);
  const q = mod(floor(z.div(pow(2, 0))), pow(2, 12));
  return q.mul(lsb);
}

export function unpackFlowerVisibility(z) {
  const slot = floor(z.div(pow(2, VIS_BIT_OFFSET)));
  return mod(slot, 2);
}
