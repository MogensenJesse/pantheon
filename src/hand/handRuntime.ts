// src/hand/handRuntime.ts — the orb's hand at work: aiming, lifting, carrying and putting down
// (pure: no DOM, no three, node-runnable; the village, the orb and the villagers come in as ports)
//
// The rule that keeps it safe: the village changes only at the drop. A lift is a hold in the view; the tree
// stays standing in the sim until `drop` pulls it out, adds its wood to a store or counts it as work on a
// site, and pays the witnesses. Any other end of a hold (`cancel`) leaves the world as it was.

import { VILLAGE } from '../config/village.ts';
import { shortages } from '../world/village/sim/economy.ts';
import { isRipe } from '../world/village/sim/fieldsDesk.ts';
import { carryPoseOf, createCarryHeading } from './carryPose.ts';
import { createDeedLedger, type DeedLedger } from './deeds.ts';
import type { DropOutcome, HandPorts, Lost, PickOutcome } from './handPorts.ts';
import {
  classifyDrop,
  costOf,
  createHand,
  type Drop,
  meetsNeed,
  pickTarget,
  reachOf,
} from './handRules.ts';
import { GOOD_OF, type HandCandidate, type Held, type Place } from './handTypes.ts';

const H = VILLAGE.HAND;

/** Seconds between looks at what is in reach while nothing is held. */
const AIM_EVERY_S = 0.1;

export interface HandRuntime {
  held: () => Held | null;
  /** What the hand would take from where the orb is now (null while something is held). Looked up a few times a second. */
  target: () => HandCandidate | null;
  /** What the hand would take from `at`, looked up now (the overview's cursor); null while something is held. */
  targetAt: (at: Place) => HandCandidate | null;
  /** Where a drop would go from `at` (the orb by default); null when nothing is held. */
  zone: (at?: Place) => Drop | null;
  /** Lifts what is in reach of `at` (the orb by default). */
  pick: (at?: Place) => PickOutcome;
  /** Puts the held thing down at `at` (the orb by default). */
  drop: (at?: Place) => DropOutcome;
  /** The player puts the held thing back on purpose: the world is as it was and the effort is lost. False when nothing is held. */
  putBack: () => boolean;
  /** The game takes the held thing away (the finale, a cutscene, shutting down): the world is as it was and the energy comes back. */
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

/** What the hand could take, collected one look at a time in objects that are kept and reused. */
function createCandidateBuffer() {
  const objects: HandCandidate[] = [];
  const list: HandCandidate[] = [];
  return {
    list,
    add: (
      kind: HandCandidate['kind'],
      id: number,
      x: number,
      z: number,
      area?: HandCandidate['area'],
    ) => {
      let c = objects[list.length];
      if (!c) {
        c = { kind, id, x, z };
        objects.push(c);
      }
      c.kind = kind;
      c.id = id;
      c.x = x;
      c.z = z;
      c.area = area;
      list.push(c);
    },
    clear: () => {
      list.length = 0;
    },
  };
}

export function createHandRuntime(ports: HandPorts): HandRuntime {
  const { village, energy } = ports;
  const { forest, buildings, remoteSites, economy, fields } = village.sim;
  const hand = createHand(energy);
  const deeds = createDeedLedger(ports.deeds);
  const heading = createCarryHeading();
  const near: number[] = [];
  const sheepNear: { id: number; x: number; z: number }[] = [];
  // The 10 Hz look at the orb keeps its answer in `cached`, so it has a buffer of its own: the looks at a
  // point (the overview's cursor, a lift) must not overwrite what `target()` hands out.
  const orbLook = createCandidateBuffer();
  const pointLook = createCandidateBuffer();
  let cached: HandCandidate | null = null;
  let sinceAim = Number.POSITIVE_INFINITY;

  const reachMul = () => ports.reachMul?.() ?? 1;
  const costMul = () => ports.costMul?.() ?? 1;

  /** The thing nearest `at` within reach; the answer lives in `look` until the next look with it. */
  const aim = (at: Place, look: ReturnType<typeof createCandidateBuffer>): HandCandidate | null => {
    if (ports.blocked?.()) return null;
    look.clear();
    forest.within(at.x, at.z, reachOf('tree', reachMul()), near);
    for (const id of near) {
      const tree = forest.info(id);
      look.add('tree', id, tree.x, tree.z);
    }
    for (const f of fields) {
      // A field is its own area: it has the half sizes and the turn.
      if (isRipe(f.growth)) look.add('wheat', f.id, f.x, f.z, f);
    }
    if (ports.animals) {
      const reach = reachOf('sheep', reachMul());
      for (const s of ports.animals.sheepWithin(at.x, at.z, reach, sheepNear)) {
        look.add('sheep', s.id, s.x, s.z);
      }
    }
    return pickTarget(look.list, at, reachMul());
  };

  /** What can still be given for a held thing: a tree still standing, a field still ripe, a sheep still in the hand. */
  const intact = (held: Held): boolean => {
    if (held.kind === 'tree') return forest.isStanding(held.id);
    if (held.kind === 'sheep') return ports.animals?.holding() ?? false;
    const field = fields.find((f) => f.id === held.id);
    return !!field && isRipe(field.growth);
  };

  /** Takes the held thing out of the village at the drop and returns what it was worth (0 when it is gone). */
  const take = (held: Held): number => {
    if (!intact(held)) return 0;
    if (held.kind === 'sheep') return H.ANIMAL_FOOD.sheep;
    return held.kind === 'tree' ? village.uprootTree(held.id) : village.takeHarvest(held.id);
  };

  /** Ends what the view shows of a hold. */
  const letGo = (held: Held, putBack: boolean) => {
    if (held.kind === 'sheep') ports.animals?.release(putBack ? 'back' : 'consumed');
    else village.carry.release(held.kind, held.id, putBack);
  };

  const cancel = () => {
    const was = hand.release('forced');
    if (!was) return false;
    letGo(was, true);
    cached = null;
    return true;
  };

  const putBack = () => {
    const was = hand.release('voluntary');
    if (!was) return false;
    letGo(was, true);
    cached = null;
    return true;
  };

  return {
    held: () => hand.held(),
    target: () => (hand.held() ? null : cached),
    targetAt: (at) => (hand.held() ? null : aim(at, pointLook)),
    zone: (at = ports.orb()) => {
      const held = hand.held();
      return held ? classifyDrop(GOOD_OF[held.kind], at, buildings, remoteSites) : null;
    },
    pick: (at = ports.orb()) => {
      if (ports.blocked?.()) return { ok: false, reason: 'blocked' };
      if (hand.held()) return { ok: false, reason: 'busy' };
      const target = aim(at, pointLook);
      if (!target) return { ok: false, reason: 'none' };
      const picked = hand.pick(target, costOf(target.kind, costMul()));
      if (picked !== 'ok') return { ok: false, reason: picked };
      const lifted =
        target.kind === 'sheep'
          ? !!ports.animals?.lift(target.id)
          : village.carry.lift(target.kind, target.id);
      if (!lifted) {
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
      const zone = classifyDrop(good, at, buildings, remoteSites);
      if (zone.zone === 'none') {
        putBack();
        return { kind: 'released' };
      }
      // What was short before the delivery, so a delivery that fills a need is worth more.
      const short = shortages(economy.stock, ports.deeds.villagers.count);
      const amount = take(held);
      if (!(amount > 0)) {
        cancel();
        return { kind: 'gone' };
      }
      letGo(held, false);
      hand.release('delivered');
      cached = null;
      // The stores keep what fits; a site takes wood as work (food never lands on a site). Either way the deed counts.
      let kept = amount;
      if (zone.zone === 'site') village.haul(zone.building.id, amount);
      else if (zone.zone === 'remote') village.haulRemote(zone.site.id, amount);
      else kept = good === 'wood' ? economy.addWood(amount) : economy.addFood(amount);
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
          amount,
          kept,
          zone: zone.zone,
          x: at.x,
          z: at.z,
          impressed: seen.impressed.length,
          converted: seen.converted.length,
        },
      };
    },
    putBack,
    cancel,
    update: (dt) => {
      deeds.update(dt);
      const held = hand.held();
      if (held) {
        if (ports.blocked?.()) {
          cancel();
          return 'blocked';
        }
        if (!intact(held)) {
          cancel();
          return 'gone';
        }
        return null;
      }
      sinceAim += dt;
      if (sinceAim >= AIM_EVERY_S) {
        sinceAim = 0;
        cached = ports.active && !ports.active() ? null : aim(ports.orb(), orbLook);
      }
      return null;
    },
    frame: (dt, orb) => {
      const held = hand.held();
      if (!held) return;
      const pose = carryPoseOf(held.kind, orb, heading.update(dt, orb.x, orb.z));
      if (held.kind === 'sheep') ports.animals?.pose(pose);
      else village.carry.pose(held.kind, held.id, pose);
    },
    energyOnHold: () => hand.held()?.cost ?? 0,
    villagerRemoved: deeds.villagerRemoved,
    deeds,
  };
}
