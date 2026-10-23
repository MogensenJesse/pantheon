// src/hand/deeds.ts — what the village makes of the hand's deeds (pure: no DOM, no three, node-runnable)
//
// A deed is a lift or a delivery. Villagers outdoors, awake and alive within WITNESS_M of it see it: they
// stop and look, and gain belief (a little awe at a lift, more at a delivery, more again when the delivery
// meets an open need). Each villager is paid per kind of deed no more often than its cooldown, which lives in
// memory only. The elder waits for his quest step like everyone else the orb cannot reach yet; he still looks.

import { VILLAGE } from '../config/village.ts';
import { distXZ } from '../core/math/geom.ts';
import { Activity, type Villagers } from '../world/village/model/types.ts';
import type { HandKind, Place } from './handTypes.ts';

const D = VILLAGE.HAND.DEED;
/** Twenty small payouts can land a hair under 1 in float32; this close counts as believing. */
const NEARLY_BELIEVING = 0.999;

export interface DeedWorld {
  villagers: Villagers;
  /** Raises a villager's belief; true when it just reached 1. */
  addBelief: (villager: number, amount: number) => boolean;
  /** Stops a villager, looking at (x, z), for a few seconds; false for someone indoors. */
  notice?: (villager: number, x: number, z: number, seconds: number) => boolean;
  /** Whether the orb may raise this villager's belief now (the elder waits for his quest step). */
  canBelieve?: (villager: number) => boolean;
}

export type DeedKind = 'lift' | 'deliver';

export interface Deed {
  kind: DeedKind;
  what: HandKind;
  /** Where it happened: the thing's place at a lift, the drop at a delivery. */
  at: Place;
  /** The delivery met an open need (see `meetsNeed`). */
  needMet?: boolean;
}

export interface DeedResult {
  /** Everyone who saw it: outdoors, awake, alive and in range. */
  witnesses: number[];
  /** Those whose belief rose. */
  impressed: number[];
  /** Those who reached full belief by it. */
  converted: number[];
}

export interface DeedLedger {
  /** Pays the witnesses of a deed. Deeds count whatever the stores hold. */
  perform: (deed: Deed) => DeedResult;
  /** Runs the cooldowns, once per fixed step. */
  update: (dt: number) => void;
  /** Seconds before this villager can be paid for `kind` again (0 when ready). */
  cooldown: (villager: number, kind: DeedKind) => number;
  /** A villager left the pool and the last one took their slot (`moved` is its old index, -1 if none). */
  villagerRemoved: (villager: number, moved: number) => void;
}

/** Villagers outdoors, awake and alive within `radiusM` of a place: those who can see a deed. */
export function witnessesWithin(world: DeedWorld, at: Place, radiusM: number): number[] {
  const v = world.villagers;
  const out: number[] = [];
  for (let i = 0; i < v.count; i++) {
    if (v.indoors[i] || v.dying[i]! > 0 || v.activity[i] === Activity.Sleep) continue;
    if (distXZ(v.x[i]!, v.z[i]!, at.x, at.z) <= radiusM) out.push(i);
  }
  return out;
}

/** Belief each witness gains from a deed. */
export function beliefOf(deed: Pick<Deed, 'kind' | 'what' | 'needMet'>): number {
  const base = deed.kind === 'lift' ? D.LIFT_BELIEF : D.DELIVER_BELIEF;
  const need = deed.kind === 'deliver' && deed.needMet ? D.NEED_MUL : 1;
  return base * D.WORTH[deed.what] * need;
}

export function createDeedLedger(world: DeedWorld): DeedLedger {
  const left: Record<DeedKind, Map<number, number>> = { lift: new Map(), deliver: new Map() };
  const COOLDOWN: Record<DeedKind, number> = {
    lift: D.LIFT_COOLDOWN_S,
    deliver: D.DELIVER_COOLDOWN_S,
  };

  /** Raises one villager's belief; true when they crossed to full belief. */
  const pay = (i: number, amount: number): boolean => {
    let crossed = world.addBelief(i, amount);
    // The end of a run of small payouts is a conversion, even when float rounding leaves belief a hair under 1.
    if (!crossed && world.villagers.belief[i]! >= NEARLY_BELIEVING) crossed = world.addBelief(i, 1);
    return crossed;
  };

  return {
    perform: (deed) => {
      const v = world.villagers;
      const witnesses = witnessesWithin(world, deed.at, D.WITNESS_M);
      const impressed: number[] = [];
      const converted: number[] = [];
      const amount = beliefOf(deed);
      const cool = left[deed.kind];
      for (const i of witnesses) {
        world.notice?.(i, deed.at.x, deed.at.z, D.NOTICE_S);
        if (v.belief[i]! >= 1 || cool.has(i)) continue;
        if (world.canBelieve && !world.canBelieve(i)) continue;
        cool.set(i, COOLDOWN[deed.kind]);
        impressed.push(i);
        if (pay(i, amount)) converted.push(i);
      }
      return { witnesses, impressed, converted };
    },
    update: (dt) => {
      if (!(dt > 0)) return;
      for (const kind of ['lift', 'deliver'] as const) {
        const cool = left[kind];
        for (const [i, s] of cool) {
          if (s - dt <= 0) cool.delete(i);
          else cool.set(i, s - dt);
        }
      }
    },
    cooldown: (villager, kind) => left[kind].get(villager) ?? 0,
    villagerRemoved: (villager, moved) => {
      for (const cool of Object.values(left)) {
        cool.delete(villager);
        if (moved >= 0 && cool.has(moved)) {
          cool.set(villager, cool.get(moved)!);
          cool.delete(moved);
        }
      }
    },
  };
}
