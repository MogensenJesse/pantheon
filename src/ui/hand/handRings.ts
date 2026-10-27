// src/ui/hand/handRings.ts — where the hand's rings hang and how big they are (the roam view and the overview
// both draw them: a ring on what would be lifted, and a ring on where a held thing would go)

import { VILLAGE } from '../../config/village';
import type { Drop } from '../../hand/handRules';
import type { HandCandidate } from '../../hand/handTypes';

/** Metres above the ground the rings hang: over a tree (about the trunk's middle), a field, a sheep's back, a drop zone. */
const TREE_LIFT_M = 1.6;
const FIELD_LIFT_M = 0.4;
const SHEEP_LIFT_M = 0.6;
const ZONE_LIFT_M = 0.3;

const TREE_RING_M = 2.4;
const SHEEP_RING_M = 1.4;

/** A ring to draw: its middle on the ground, how high it hangs and how wide it is. */
export interface Ring {
  x: number;
  z: number;
  liftM: number;
  sizeM: number;
}

export const newRing = (): Ring => ({ x: 0, z: 0, liftM: 0, sizeM: 0 });

/** The ring on what the hand would lift, written to `out`. */
export function targetRing(target: HandCandidate, out: Ring): Ring {
  out.x = target.x;
  out.z = target.z;
  if (target.area) {
    out.liftM = FIELD_LIFT_M;
    out.sizeM = 2 * Math.max(target.area.halfW, target.area.halfD);
  } else if (target.kind === 'sheep') {
    out.liftM = SHEEP_LIFT_M;
    out.sizeM = SHEEP_RING_M;
  } else {
    out.liftM = TREE_LIFT_M;
    out.sizeM = TREE_RING_M;
  }
  return out;
}

/** The ring on where a held thing would go, written to `out`; false when it would go nowhere. */
export function zoneRing(zone: Drop, out: Ring): boolean {
  if (zone.zone === 'none') return false;
  out.liftM = ZONE_LIFT_M;
  if (zone.zone === 'remote') {
    out.x = zone.x;
    out.z = zone.z;
    out.sizeM = 2 * VILLAGE.HAND.REMOTE_DROP_M;
  } else {
    // The zone is the footprint grown by the margin on every side.
    const b = zone.building;
    out.x = b.x;
    out.z = b.z;
    out.sizeM = 2 * (Math.max(b.halfW, b.halfD) + VILLAGE.HAND.ZONE_MARGIN_M);
  }
  return true;
}
