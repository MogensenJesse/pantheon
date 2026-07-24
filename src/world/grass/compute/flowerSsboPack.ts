// src/world/grass/compute/flowerSsboPack.ts — vec4.z packs height (12 bits) + visibility (1 bit)
import { clamp, EPSILON, float, floor, max, mod, pow, round, sub } from 'three/tsl';
import type { TslNode } from '../tsl/tslNode';

const VIS_BIT_OFFSET = 12;

/** Pack world Y + visibility flag into vec4.z (Revo-style).
 *  `yOffset` is full surface Y + surfaceBias from createSampleGrassData.
 */
export function packFlowerStateZ(
  yOffset: TslNode,
  visibility: TslNode,
  heightMax: TslNode,
): TslNode {
  const levels = sub(pow(2, 12), 1);
  const lsb = heightMax.div(levels);
  const qRaw = yOffset.div(max(lsb, EPSILON));
  const q = clamp(round(qRaw), 0, levels);
  const heightPart = q.mul(pow(2, 0));
  const visPart = visibility.greaterThan(0.5).select(pow(2, VIS_BIT_OFFSET), float(0));
  return heightPart.add(visPart);
}

export function unpackFlowerHeight(z: TslNode, heightMax: TslNode): TslNode {
  const levels = sub(pow(2, 12), 1);
  const lsb = heightMax.div(levels);
  const q = mod(floor(z.div(pow(2, 0))), pow(2, 12));
  return q.mul(lsb);
}
