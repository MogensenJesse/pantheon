// src/hand/handRules.ts — what the hand may take, where it may be put down, and what holding costs
// (pure: no DOM, no three, node-runnable)
//
// The hand holds a thing in the view only. The village changes at the drop, so a hold that ends any other
// way leaves the world as it was (see `createHand`).

import { VILLAGE } from '../config/village.ts';
import { distXZ } from '../core/math/geom.ts';
import type { Building, RemoteSite } from '../world/village/model/types.ts';
import { isOpenSite } from '../world/village/sim/construction.ts';
import type {
  Good,
  HandCandidate,
  HandEnergy,
  HandKind,
  Held,
  Place,
  Release,
} from './handTypes.ts';

const H = VILLAGE.HAND;

/** How near the orb has to be to take a kind (m), with the skill tree's reach factor. */
export const reachOf = (kind: HandKind, reachMul = 1): number => H.REACH_M[kind] * reachMul;

/** Energy a lift of `kind` costs, with the skill tree's cost factor. */
export const costOf = (kind: HandKind, costMul = 1): number => H.COST[kind] * costMul;

/** Whether a field has grown enough to be harvested by hand. */
export const isRipe = (growth: number): boolean => growth >= H.WHEAT.MIN_RIPE;

/** How far `at` is from a candidate: from its middle, or for a field from its edge (0 inside). */
export function distanceTo(c: HandCandidate, at: Place): number {
  if (!c.area) return distXZ(c.x, c.z, at.x, at.z);
  const cos = Math.cos(c.area.rotY);
  const sin = Math.sin(c.area.rotY);
  const dx = at.x - c.x;
  const dz = at.z - c.z;
  const lx = Math.abs(dx * cos - dz * sin);
  const lz = Math.abs(dx * sin + dz * cos);
  return Math.hypot(Math.max(0, lx - c.area.halfW), Math.max(0, lz - c.area.halfD));
}

/**
 * The thing the hand would take from where the orb is: the candidate nearest to the orb that is within the
 * reach of its kind. A tie goes to the lower id of the lower kind, so the choice never flickers.
 */
export function pickTarget(
  candidates: readonly HandCandidate[],
  at: Place,
  reachMul = 1,
): HandCandidate | null {
  let best: HandCandidate | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = distanceTo(c, at);
    if (d > reachOf(c.kind, reachMul)) continue;
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best && order(c, best) < 0)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

const KIND_ORDER: Readonly<Record<HandKind, number>> = { tree: 0, wheat: 1, sheep: 2 };
const order = (a: HandCandidate, b: HandCandidate) =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id - b.id;

/** Where a thing can be put down: the buildings that take the village's goods. */
const STORE_TYPES: ReadonlySet<Building['type']> = new Set([
  'temple',
  'granary',
  'workshop',
  'well',
]);

/**
 * What a drop came to. A store takes the good into the stock; a build site takes wood as builder work, and so
 * does a remote site (`x`, `z` is the middle of the circle the drop landed in: its camp or its place).
 */
export type Drop =
  | { zone: 'none' }
  | { zone: 'store'; building: Building }
  | { zone: 'site'; building: Building }
  | { zone: 'remote'; site: RemoteSite; x: number; z: number };

/** Whether `at` lies on a building's footprint or within `marginM` of it. */
export function insideBuilding(b: Building, at: Place, marginM: number): boolean {
  const cos = Math.cos(b.rotY);
  const sin = Math.sin(b.rotY);
  const dx = at.x - b.x;
  const dz = at.z - b.z;
  return (
    Math.abs(dx * cos - dz * sin) <= b.halfW + marginM &&
    Math.abs(dx * sin + dz * cos) <= b.halfD + marginM
  );
}

/** The unfinished remote site (if any) whose camp or place `at` lies within `radiusM` of; the nearer middle wins. */
function remoteZone(
  at: Place,
  sites: readonly RemoteSite[],
  radiusM: number,
): Extract<Drop, { zone: 'remote' }> | null {
  let best: Extract<Drop, { zone: 'remote' }> | null = null;
  let bestD = radiusM;
  for (const site of sites) {
    if (site.stage >= 2) continue;
    const camp = distXZ(site.campX, site.campZ, at.x, at.z);
    if (camp <= bestD) {
      best = { zone: 'remote', site, x: site.campX, z: site.campZ };
      bestD = camp;
    }
    const place = distXZ(site.x, site.z, at.x, at.z);
    if (place < bestD) {
      best = { zone: 'remote', site, x: site.x, z: site.z };
      bestD = place;
    }
  }
  return best;
}

/**
 * What putting `good` down at `at` comes to. Wood prefers an open site (it counts as work for the builders)
 * and otherwise goes to a store; food only goes to a store. Of several buildings the nearest middle wins.
 * Wood put down at an unfinished remote site (far outside the village) is work for its crew; a building zone
 * is looked at first.
 */
export function classifyDrop(
  good: Good,
  at: Place,
  buildings: readonly Building[],
  remoteSites: readonly RemoteSite[] = [],
  marginM = H.ZONE_MARGIN_M,
): Drop {
  let site: Building | null = null;
  let store: Building | null = null;
  let siteD = Number.POSITIVE_INFINITY;
  let storeD = Number.POSITIVE_INFINITY;
  for (const b of buildings) {
    if (!insideBuilding(b, at, marginM)) continue;
    const d = distXZ(b.x, b.z, at.x, at.z);
    if (good === 'wood' && isOpenSite(b) && d < siteD) {
      site = b;
      siteD = d;
    }
    if (b.stage >= 2 && STORE_TYPES.has(b.type) && d < storeD) {
      store = b;
      storeD = d;
    }
  }
  if (site) return { zone: 'site', building: site };
  if (store) return { zone: 'store', building: store };
  if (good === 'wood') return remoteZone(at, remoteSites, H.REMOTE_DROP_M) ?? { zone: 'none' };
  return { zone: 'none' };
}

/** Whether a delivery met an open need: wood for a site, or a store that was running short of that good. */
export function meetsNeed(
  good: Good,
  drop: Drop,
  short: Readonly<{ food: boolean; wood: boolean }>,
): boolean {
  if (drop.zone === 'site' || drop.zone === 'remote') return true;
  return drop.zone === 'store' && short[good];
}

export type PickResult = 'ok' | 'busy' | 'energy';

/** The hand's hold: nothing, or one thing whose energy has been paid. Ending a hold is safe to repeat. */
export interface Hand {
  held: () => Held | null;
  /** Take `target`, paying `cost` now. `'busy'` when the hand is full, `'energy'` when it cannot pay. */
  pick: (target: HandCandidate, cost: number) => PickResult;
  /**
   * End the hold. `'forced'` gives the energy back, `'voluntary'` and `'delivered'` keep it spent.
   * Returns what was held, or null when nothing was (so a second call changes nothing).
   */
  release: (how: Release) => Held | null;
}

export function createHand(energy: HandEnergy): Hand {
  let held: Held | null = null;
  return {
    held: () => held,
    pick: (target, cost) => {
      if (held) return 'busy';
      if (energy.amount() < cost) return 'energy';
      energy.spend(cost);
      held = { kind: target.kind, id: target.id, x: target.x, z: target.z, cost };
      return 'ok';
    },
    release: (how) => {
      const was = held;
      if (!was) return null;
      held = null;
      if (how === 'forced') energy.refund(was.cost);
      return was;
    },
  };
}
