// src/hand/handTypes.ts — what the orb's hand deals in (pure: no DOM, no three, node-runnable)

import type { XZ } from '../core/math/geom.ts';
import type { CarriedKind } from '../world/village/model/carried.ts';

export type Place = XZ;

/** The orb's energy as the hand sees it: a lift is paid at once, and a forced cancel gives it back. */
export interface HandEnergy {
  amount: () => number;
  spend: (amount: number) => void;
  refund: (amount: number) => void;
}

/** What the hand can lift: what the village shows being carried, and the farm's sheep. */
export type HandKind = CarriedKind | 'sheep';

/** Every kind, in the order a tie between two things at the same distance is settled. */
export const HAND_KINDS: readonly HandKind[] = ['tree', 'wheat', 'sheep'];

/** What each kind becomes in the village stock when it is delivered. */
export type Good = 'wood' | 'food';

export const GOOD_OF: Readonly<Record<HandKind, Good>> = {
  tree: 'wood',
  wheat: 'food',
  sheep: 'food',
};

/**
 * Where a delivery landed: a store takes the good into the stock; a build site or a remote site (a place being
 * restored, an outpost) takes wood as builder work.
 */
export type DropZone = 'store' | 'site' | 'remote';

/** Something the hand could take, and where it is. */
export interface HandCandidate {
  kind: HandKind;
  /** The tree, field or animal's id in its own system. */
  id: number;
  x: number;
  z: number;
  /** A field is an area: how far the orb is from it is measured to its edge. */
  area?: { halfW: number; halfD: number; rotY: number };
}

/** What the hand is holding: the thing, and the energy that was paid for it. */
export interface Held {
  kind: HandKind;
  id: number;
  /** Where it was lifted from (the world's coordinates). */
  x: number;
  z: number;
  cost: number;
}

/** How a hold ended. */
export type Release =
  /** Put down in a zone: the village changed and the energy stays spent. */
  | 'delivered'
  /** The game took it away (the finale, a cutscene or other block, the hand being shut down): the energy is given back. */
  | 'forced'
  /** The player let go outside any zone: the thing goes back and the energy is lost. */
  | 'voluntary';
