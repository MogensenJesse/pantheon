// src/hand/handRuntime.ts — the orb's hand at work: aiming, lifting, carrying and putting down
// (pure: no DOM, no three, node-runnable; the village, the orb and the villagers come in as ports)
//
// The rule that keeps it safe: the village changes only at the drop. A lift is a hold in the view; the tree
// stays standing in the sim until `drop` pulls it out, adds its wood to a store or counts it as work on a
// site, and pays the witnesses. Any other end of a hold (`cancel`) leaves the world as it was.

import type { Building } from '../world/village/model/types.ts';
import { type Stock, shortages } from '../world/village/sim/economy.ts';
import { type CarryPose, carryPoseOf, createCarryHeading } from './carryPose.ts';
import { createDeedLedger, type DeedLedger, type DeedWorld } from './deeds.ts';
import {
  classifyDrop,
  costOf,
  createHand,
  type Drop,
  meetsNeed,
  pickTarget,
  reachOf,
} from './handRules.ts';
import {
  GOOD_OF,
  type HandCandidate,
  type HandEnergy,
  type Held,
  type Place,
} from './handTypes.ts';

/** Seconds between looks at what is in reach while nothing is held. */
const AIM_EVERY_S = 0.1;

/** What the hand shows while it holds a tree (view only). */
export interface HandCarry {
  /** Hides the tree and shows a stump; false when it cannot be lifted. */
  lift: (tree: number) => boolean;
  pose: (tree: number, pose: CarryPose) => void;
  /** Ends the hold. `putBack` restores the tree; otherwise the village's own events carry on from here. */
  release: (tree: number, putBack: boolean) => void;
}

/** The village as the hand reaches it; a `VillageSystemContext` fits. */
export interface HandVillage {
  readonly sim: {
    readonly forest: {
      info: (id: number) => { x: number; z: number };
      isStanding: (id: number) => boolean;
      within: (x: number, z: number, radiusM: number, out: number[]) => number[];
    };
    readonly buildings: readonly Building[];
    readonly economy: {
      readonly stock: Readonly<Stock>;
      addWood: (amount: number) => number;
      addFood: (amount: number) => number;
    };
  };
  /** Pulls a standing tree out of the ground and returns its wood (0 when it was not standing). */
  uprootTree: (id: number) => number;
  /** Counts wood brought to an open site as work; returns the seconds given. */
  haul: (siteId: number, wood: number) => number;
  carry: HandCarry;
}

export interface HandPorts {
  energy: HandEnergy;
  /** Where the orb is on the ground: the hand acts from there. */
  orb: () => Place;
  village: HandVillage;
  /** Who sees deeds, and whether the orb may win their belief. */
  deeds: DeedWorld;
  /** The skill tree's factors on reach and on cost (1 when it has none). */
  reachMul?: () => number;
  costMul?: () => number;
  /** True while the hand may not be used (a cutscene, a mode that owns the orb): a hold ends and nothing can be lifted. */
  blocked?: () => boolean;
}

/** What a delivery came to. */
export interface Delivery {
  what: Held['kind'];
  /** Wood or food that arrived; wood hauled to a site counts as wood. */
  amount: number;
  /** How much of it the store had room for (all of it at a site, where it is work). */
  kept: number;
  zone: 'store' | 'site';
  x: number;
  z: number;
  /** Villagers whose belief rose, and those who reached full belief by it. */
  impressed: number;
  converted: number;
}

export type PickOutcome =
  | { ok: true; held: Held; impressed: number }
  | { ok: false; reason: 'blocked' | 'busy' | 'none' | 'energy' };

export type DropOutcome =
  | { kind: 'delivered'; delivery: Delivery }
  /** Let go outside every zone: the thing went back, the energy is lost. */
  | { kind: 'released' }
  /** The thing was taken meanwhile (a woodcutter felled the tree): nothing changed and the energy came back. */
  | { kind: 'gone' }
  | { kind: 'empty' };

/** How a hold ended without the player doing anything. */
export type Lost = 'blocked' | 'gone';

export interface HandRuntime {
  held: () => Held | null;
  /** What the hand would take from where the orb is now (null while something is held). Looked up a few times a second. */
  target: () => HandCandidate | null;
  /** Where a drop would go from `at` (the orb by default); null when nothing is held. */
  zone: (at?: Place) => Drop | null;
  /** Lifts what is in reach of `at` (the orb by default). */
  pick: (at?: Place) => PickOutcome;
  /** Puts the held thing down at `at` (the orb by default). */
  drop: (at?: Place) => DropOutcome;
  /** The game takes the held thing away (a save, a cutscene): the world is as it was and the energy comes back. */
  cancel: () => boolean;
  /** Once per fixed step. Says why a hold ended by itself. */
  update: (dt: number) => Lost | null;
  /** Once per drawn frame: carries the held tree with the orb, which is drawn at `orb`. */
  frame: (dt: number, orb: { x: number; y: number; z: number }) => void;
  /** Energy the hold has paid and not yet delivered (a save counts it as still unspent). */
  energyOnHold: () => number;
  /** A villager left the pool and the last one took their slot. */
  villagerRemoved: (villager: number, moved: number) => void;
  readonly deeds: DeedLedger;
}

export function createHandRuntime(ports: HandPorts): HandRuntime {
  const { village, energy } = ports;
  const { forest, buildings, economy } = village.sim;
  const hand = createHand(energy);
  const deeds = createDeedLedger(ports.deeds);
  const heading = createCarryHeading();
  const near: number[] = [];
  let cached: HandCandidate | null = null;
  let sinceAim = Number.POSITIVE_INFINITY;

  const reachMul = () => ports.reachMul?.() ?? 1;
  const costMul = () => ports.costMul?.() ?? 1;

  /** The thing nearest `at` within reach. */
  const aim = (at: Place): HandCandidate | null => {
    if (ports.blocked?.()) return null;
    forest.within(at.x, at.z, reachOf('tree', reachMul()), near);
    const candidates: HandCandidate[] = near.map((id) => {
      const tree = forest.info(id);
      return { kind: 'tree', id, x: tree.x, z: tree.z };
    });
    return pickTarget(candidates, at, reachMul());
  };

  /** Ends what the view shows of a hold. */
  const letGo = (held: Held, putBack: boolean) => {
    village.carry.release(held.id, putBack);
  };

  const cancel = () => {
    const was = hand.release('forced');
    if (!was) return false;
    letGo(was, true);
    cached = null;
    return true;
  };

  return {
    held: () => hand.held(),
    target: () => (hand.held() ? null : cached),
    zone: (at = ports.orb()) => {
      const held = hand.held();
      return held ? classifyDrop(GOOD_OF[held.kind], at, buildings) : null;
    },
    pick: (at = ports.orb()) => {
      if (ports.blocked?.()) return { ok: false, reason: 'blocked' };
      if (hand.held()) return { ok: false, reason: 'busy' };
      const target = aim(at);
      if (!target) return { ok: false, reason: 'none' };
      const picked = hand.pick(target, costOf(target.kind, costMul()));
      if (picked !== 'ok') return { ok: false, reason: picked };
      if (!village.carry.lift(target.id)) {
        hand.release('forced');
        return { ok: false, reason: 'none' };
      }
      cached = null;
      heading.reset(at.x, at.z, heading.heading());
      // Awe at the lift: the villagers near the tree see it come out of the ground.
      const seen = deeds.perform({ kind: 'lift', what: target.kind, at: target });
      return { ok: true, held: hand.held()!, impressed: seen.impressed.length };
    },
    drop: (at = ports.orb()) => {
      const held = hand.held();
      if (!held) return { kind: 'empty' };
      const good = GOOD_OF[held.kind];
      const zone = classifyDrop(good, at, buildings);
      if (zone.zone === 'none') {
        hand.release('voluntary');
        letGo(held, true);
        cached = null;
        return { kind: 'released' };
      }
      // What was short before the delivery, so a delivery that fills a need is worth more.
      const short = shortages(economy.stock, ports.deeds.villagers.count);
      const wood = forest.isStanding(held.id) ? village.uprootTree(held.id) : 0;
      if (!(wood > 0)) {
        cancel();
        return { kind: 'gone' };
      }
      letGo(held, false);
      hand.release('delivered');
      cached = null;
      // The stores keep what fits; a site takes it all as work. Either way the deed counts.
      let kept = wood;
      if (zone.zone === 'store') kept = economy.addWood(wood);
      else village.haul(zone.building.id, wood);
      const seen = deeds.perform({
        kind: 'deliver',
        what: held.kind,
        at,
        needMet: meetsNeed(good, zone, short),
      });
      return {
        kind: 'delivered',
        delivery: {
          what: held.kind,
          amount: wood,
          kept,
          zone: zone.zone,
          x: at.x,
          z: at.z,
          impressed: seen.impressed.length,
          converted: seen.converted.length,
        },
      };
    },
    cancel,
    update: (dt) => {
      deeds.update(dt);
      const held = hand.held();
      if (held) {
        if (ports.blocked?.()) {
          cancel();
          return 'blocked';
        }
        if (!forest.isStanding(held.id)) {
          cancel();
          return 'gone';
        }
        return null;
      }
      sinceAim += dt;
      if (sinceAim >= AIM_EVERY_S) {
        sinceAim = 0;
        cached = aim(ports.orb());
      }
      return null;
    },
    frame: (dt, orb) => {
      const held = hand.held();
      if (!held) return;
      village.carry.pose(held.id, carryPoseOf(orb, heading.update(dt, orb.x, orb.z)));
    },
    energyOnHold: () => hand.held()?.cost ?? 0,
    villagerRemoved: deeds.villagerRemoved,
    deeds,
  };
}
