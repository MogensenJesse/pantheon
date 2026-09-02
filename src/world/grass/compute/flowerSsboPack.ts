// src/world/grass/compute/flowerSsboPack.ts — vec4.z is world Y (meters); w holds vis + debug reason
import { float, floor, mod, step } from 'three/tsl';
import type { TslNode } from '../tsl/tslNode';

/** w: vis 0 | debug reason 1–4 (values 0–8). Stays ≤ 17 so f16 is exact. */
const REASON_MUL = 2;

export function packFlowerStateW(visibility: TslNode, debugReason: TslNode): TslNode {
  const visPart = visibility.greaterThan(0.5).select(float(1), float(0));
  return visPart.add(debugReason.mul(float(REASON_MUL)));
}

export function unpackFlowerVisibility(w: TslNode): TslNode {
  return step(float(0.5), mod(floor(w), float(2)));
}

export function unpackFlowerDebugReason(w: TslNode): TslNode {
  return floor(w.div(float(REASON_MUL)));
}
