// src/life/lifeRules.ts — how much life each place of power has (pure: node-runnable)
//
// A place's level, 0..1, comes from where the story stands: nothing while it sleeps, faint once it has woken, the
// full set once the village has restored it, and a small mark that stays at every place once the name has returned.
// The level only says how much of the place's life shows; what that life is (a flock, fireflies, leaves, motes) is
// decided by the kind of place (`lifeOf`). Nothing is saved: a load works the level out again from the same facts.

import { life } from '../config/visual/life.ts';
import { clamp01 } from '../core/math/scalar.ts';
import type { LandmarkKind } from '../map/MapTypes.ts';

const P = life.PLACES;

/** What the story says about one place. */
export interface PlaceFacts {
  awake: boolean;
  restored: boolean;
  /** The name has returned (the last quest is done). */
  nameReturned: boolean;
}

/** The level a place's life is heading for. */
export function placeTarget(facts: PlaceFacts): number {
  const base = facts.restored ? P.LEVELS.RESTORED : facts.awake ? P.LEVELS.AWAKE : 0;
  return facts.nameReturned ? Math.max(base, P.LEVELS.TRACE) : base;
}

/** Moves a level toward its target at the speed that takes `EASE_S` to cross 0..1 (so a sudden change never pops). */
export function easeLevel(current: number, target: number, dt: number): number {
  const step = dt / P.EASE_S;
  return clamp01(current + Math.max(-step, Math.min(step, target - current)));
}

/** The share of a firefly cloud shown: full at night, `FIREFLY_GOLDEN` at dusk and dawn, none by day. */
export function fireflyGate(night01: number, golden01: number): number {
  return Math.max(clamp01(night01), P.FIREFLY_GOLDEN * clamp01(golden01));
}

/** What a kind of place has: a cloud of specks, a flock of birds, or both. */
export interface PlaceLifeSpec {
  cloud?: 'fireflies' | 'ring-fireflies' | 'motes' | 'leaves';
  flock?: 'songbird' | 'dove';
}

const LIFE: Readonly<Record<LandmarkKind, PlaceLifeSpec>> = {
  tree: { flock: 'songbird', cloud: 'leaves' },
  sunken_ruin: { cloud: 'fireflies' },
  runestones: { cloud: 'ring-fireflies' },
  temple_ruin: { flock: 'dove' },
  monolith: { cloud: 'motes' },
};

export const lifeOf = (kind: LandmarkKind): PlaceLifeSpec => LIFE[kind];

/** Every kind of place there is (this module lists them all, so it needs no runtime import of the map types). */
export const LIFE_KINDS = Object.keys(LIFE) as LandmarkKind[];

/** Whether the cloud of a place is a night thing (fireflies) that the time of day gates. */
export const isFireflyCloud = (cloud: PlaceLifeSpec['cloud']): boolean =>
  cloud === 'fireflies' || cloud === 'ring-fireflies';
