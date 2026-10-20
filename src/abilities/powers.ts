// src/abilities/powers.ts — what the three conversion powers do to the village (pure: no DOM, no three)
//
//   Murmur  a channel on the nearest villager within a few metres: their belief rises while the orb stays
//           close and the energy lasts, and they stand still, looking at the orb.
//   Dream   the sleepers of the nearest house gain belief, once per house per night.
//   Sign    everyone outdoors within earshot of a small miracle gains belief and stops to look.
//
// The village is reached through `PowerWorld`, so the same code runs in the game and in node.

import { PHASE0 } from '../config/phase0.ts';
import { distXZ as dist, type XZ } from '../core/math/geom.ts';
import { isFinished, isHouse } from '../world/village/model/buildings.ts';
import { Activity, type Building, type Villagers } from '../world/village/model/types.ts';
import { ABILITY_IDS, type AbilityDef, type AbilityTarget } from './abilities.ts';

const { MURMUR, DREAM, SIGN } = PHASE0.POWERS;
const { DAY } = PHASE0;
/** Twenty steps of a twentieth can land a hair under 1 in float32; this close counts as believing. */
const NEARLY_BELIEVING = 0.999;

export interface PowerWorld {
  villagers: Villagers;
  buildings: readonly Building[];
  /** Raises a villager's belief; true when it just reached 1. */
  addBelief: (villager: number, amount: number) => boolean;
  /** Holds a villager still, facing (x, z), for a few seconds; false for someone indoors. */
  notice: (villager: number, x: number, z: number, seconds: number) => boolean;
  /** Whether the orb may raise this villager's belief now (the elder waits for his quest step). */
  canBelieve?: (villager: number) => boolean;
}

export type Place = XZ;

export interface EnergyMeter {
  amount: () => number;
  spend: (amount: number) => void;
}

/** Whether the orb may reach this villager now (the elder waits for his quest step). */
const reachable = (world: PowerWorld, i: number) => !world.canBelieve || world.canBelieve(i);

/**
 * The world as the powers see it: a villager who cannot believe yet never gains belief, whichever power
 * reaches them (they may still stop and look). Murmur does not target them either (`nearestVillager`).
 */
function gateBelief(world: PowerWorld): PowerWorld {
  const { canBelieve } = world;
  if (!canBelieve) return world;
  return { ...world, addBelief: (i, amount) => canBelieve(i) && world.addBelief(i, amount) };
}

/** The nearest villager outdoors within `maxM` of a place, or -1. */
export function nearestVillager(world: PowerWorld, at: Place, maxM: number): number {
  const v = world.villagers;
  let best = -1;
  let bestD = maxM;
  for (let i = 0; i < v.count; i++) {
    if (v.indoors[i] || v.dying[i]! > 0 || !reachable(world, i)) continue;
    const d = dist(v.x[i]!, v.z[i]!, at.x, at.z);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The nearest finished house within `maxM` of a place (measured to its centre), or null. */
export function nearestHouse(world: PowerWorld, at: Place, maxM: number): Building | null {
  let best: Building | null = null;
  let bestD = maxM;
  for (const b of world.buildings) {
    if (!isHouse(b) || !isFinished(b)) continue;
    const d = dist(b.x, b.z, at.x, at.z);
    if (d <= bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Villagers asleep indoors in a house. */
export function sleepersOf(world: PowerWorld, houseId: number): number[] {
  const v = world.villagers;
  const out: number[] = [];
  for (let i = 0; i < v.count; i++) {
    if (
      v.home[i] === houseId &&
      v.indoors[i] &&
      v.activity[i] === Activity.Sleep &&
      v.dying[i]! <= 0
    ) {
      out.push(i);
    }
  }
  return out;
}

/** Villagers outdoors and awake within `radiusM` of a place: those who can see a sign. */
export function witnessesWithin(world: PowerWorld, at: Place, radiusM: number): number[] {
  const v = world.villagers;
  const out: number[] = [];
  for (let i = 0; i < v.count; i++) {
    if (v.indoors[i] || v.dying[i]! > 0 || v.activity[i] === Activity.Sleep) continue;
    if (dist(v.x[i]!, v.z[i]!, at.x, at.z) <= radiusM) out.push(i);
  }
  return out;
}

/** Counts nights: a night begins when the day-cycle phase passes sunset and ends at sunrise (`PHASE0.DAY`). */
export interface NightClock {
  update: (dayPhase: number) => void;
  /** Which night it is (0 at the start of the game, up by one at each sunset). */
  id: () => number;
  isNight: () => boolean;
}

export function createNightClock(): NightClock {
  let id = 0;
  let night: boolean | null = null;
  return {
    update: (phase) => {
      const now = phase >= DAY.SUNSET || phase < DAY.SUNRISE;
      if (night === false && now) id++;
      night = now;
    },
    id: () => id,
    isNight: () => night === true,
  };
}

export interface Murmur {
  active: () => boolean;
  /** The villager being murmured to, or -1. */
  target: () => number;
  /** Starts on a villager within range of the orb; false when that is not possible. */
  start: (villager: number, orb: Place) => boolean;
  stop: () => void;
  update: (dt: number, orb: Place) => void;
  /** A villager left the pool and the last one took their slot (`moved` is its old index, -1 if none): follow it. */
  villagerRemoved: (villager: number, moved: number) => void;
}

function createMurmur(world: PowerWorld, energy: EnergyMeter): Murmur {
  let target = -1;
  let elapsed = 0;
  const stop = () => {
    target = -1;
    elapsed = 0;
  };
  return {
    active: () => target >= 0,
    target: () => target,
    start: (villager, orb) => {
      const v = world.villagers;
      if (villager < 0 || villager >= v.count || v.indoors[villager] || v.dying[villager]! > 0) {
        return false;
      }
      if (!reachable(world, villager)) return false;
      if (dist(v.x[villager]!, v.z[villager]!, orb.x, orb.z) > MURMUR.RANGE_M) return false;
      target = villager;
      elapsed = 0;
      world.notice(villager, orb.x, orb.z, MURMUR.HOLD_S);
      return true;
    },
    stop,
    villagerRemoved: (villager, moved) => {
      if (target === villager) stop();
      else if (moved >= 0 && target === moved) target = villager;
    },
    update: (dt, orb) => {
      if (target < 0 || dt <= 0) return;
      const v = world.villagers;
      if (
        v.indoors[target] ||
        v.dying[target]! > 0 ||
        dist(v.x[target]!, v.z[target]!, orb.x, orb.z) > MURMUR.RANGE_M
      ) {
        stop();
        return;
      }
      const drain = MURMUR.DRAIN_PER_SEC * dt;
      if (energy.amount() < drain) {
        stop();
        return;
      }
      energy.spend(drain);
      world.notice(target, orb.x, orb.z, MURMUR.HOLD_S);
      let converted = world.addBelief(target, dt / MURMUR.SECONDS);
      elapsed += dt;
      // The channel's end is a conversion, even when float rounding leaves belief a hair under 1.
      if (!converted && v.belief[target]! >= NEARLY_BELIEVING) {
        converted = world.addBelief(target, 1);
      }
      if (converted || v.belief[target]! >= 1 || elapsed >= MURMUR.SECONDS) stop();
    },
  };
}

export interface Dream {
  /** Whether a dream could be sent to the house now: sleepers inside and none yet tonight. */
  canDream: (houseId: number) => boolean;
  /** Every sleeper in the house gains belief; false when nothing happened. */
  cast: (houseId: number) => boolean;
}

function createDream(world: PowerWorld, night: NightClock): Dream {
  /** The night each house last had a dream. */
  const dreamt = new Map<number, number>();
  const canDream = (houseId: number) =>
    dreamt.get(houseId) !== night.id() && sleepersOf(world, houseId).length > 0;
  return {
    canDream,
    cast: (houseId) => {
      if (!canDream(houseId)) return false;
      for (const i of sleepersOf(world, houseId)) world.addBelief(i, DREAM.BELIEF);
      dreamt.set(houseId, night.id());
      return true;
    },
  };
}

/** A sign at a place: everyone who can see it gains belief and stops to look. False when nobody can. */
export function castSign(world: PowerWorld, at: Place): boolean {
  const seen = witnessesWithin(world, at, SIGN.RANGE_M);
  for (const i of seen) {
    world.addBelief(i, SIGN.BELIEF);
    world.notice(i, at.x, at.z, SIGN.NOTICE_S);
  }
  return seen.length > 0;
}

export interface Powers {
  murmur: Murmur;
  dream: Dream;
  night: NightClock;
  /** The villager the next Murmur would reach (the one being murmured to while it runs), or -1. */
  murmurTarget: (orb: Place) => number;
  /** The house the next Dream would reach (one with sleepers and no dream tonight), or -1. */
  dreamTarget: (orb: Place) => number;
  /** What a cast of `def` would aim at, from where the orb is. */
  resolveTarget: (def: AbilityDef, orb: Place) => AbilityTarget;
  /** Does the effect of a power; false when its target does not fit. */
  perform: (def: AbilityDef, target: AbilityTarget, orb: Place) => boolean;
  /** Once per fixed step. */
  update: (dt: number, orb: Place, dayPhase: number) => void;
}

export function createPowers(rawWorld: PowerWorld, energy: EnergyMeter): Powers {
  const world = gateBelief(rawWorld);
  const murmur = createMurmur(world, energy);
  const night = createNightClock();
  const dream = createDream(world, night);
  // A running channel is its own target, so casting again can end it.
  const murmurTarget = (orb: Place) =>
    murmur.active() ? murmur.target() : nearestVillager(world, orb, MURMUR.RANGE_M);
  return {
    murmur,
    dream,
    night,
    murmurTarget,
    dreamTarget: (orb) => {
      const house = nearestHouse(world, orb, DREAM.RANGE_M);
      return house && dream.canDream(house.id) ? house.id : -1;
    },
    resolveTarget: (def, orb) => {
      if (def.targeting === 'villager') return { kind: 'villager', id: murmurTarget(orb) };
      if (def.targeting === 'house') {
        return { kind: 'house', id: nearestHouse(world, orb, DREAM.RANGE_M)?.id ?? -1 };
      }
      return { kind: def.targeting, x: orb.x, z: orb.z };
    },
    perform: (def, target, orb) => {
      if (def.id === ABILITY_IDS.murmur) {
        if (murmur.active()) {
          murmur.stop();
          return true;
        }
        return murmur.start(target.id ?? -1, orb);
      }
      if (def.id === ABILITY_IDS.dream) return dream.cast(target.id ?? -1);
      if (def.id === ABILITY_IDS.sign)
        return castSign(world, { x: target.x ?? orb.x, z: target.z ?? orb.z });
      return false;
    },
    update: (dt, orb, dayPhase) => {
      night.update(dayPhase);
      murmur.update(dt, orb);
    },
  };
}
