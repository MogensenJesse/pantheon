// src/hand/handPorts.ts — what the orb's hand needs from the game, and what it reports back (types only)
//
// The village, the orb, the animals and the villagers come in as ports, so the runtime stays pure and the
// checks can stand in fakes; a delivery, a pick and a drop are told in the outcome types.

import type { CarriedKind, CarriedPose } from '../world/village/model/carried.ts';
import type { Building, Field, RemoteSite } from '../world/village/model/types.ts';
import type { Stock } from '../world/village/sim/economy.ts';
import type { DeedWorld } from './deeds.ts';
import type { DropZone, HandEnergy, Held, Place } from './handTypes.ts';

/** What the hand shows while it holds a tree or a sheaf of wheat (view only). */
export interface HandCarry {
  /** A tree is hidden and a stump shown, a sheaf is drawn at the orb; false when it cannot be lifted. */
  lift: (what: CarriedKind, id: number) => boolean;
  pose: (what: CarriedKind, id: number, pose: CarriedPose) => void;
  /** Ends the hold. `putBack` restores a tree; otherwise the village's own events carry on from here. */
  release: (what: CarriedKind, id: number, putBack: boolean) => void;
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
    /** The restorations and outposts far outside the village; wood put down at one is the crew's work. */
    readonly remoteSites: readonly RemoteSite[];
    readonly fields: readonly Pick<
      Field,
      'id' | 'x' | 'z' | 'rotY' | 'halfW' | 'halfD' | 'growth'
    >[];
    readonly economy: {
      readonly stock: Readonly<Stock>;
      addWood: (amount: number) => number;
      addFood: (amount: number) => number;
    };
  };
  /** Pulls a standing tree out of the ground and returns its wood (0 when it was not standing). */
  uprootTree: (id: number) => number;
  /** Reaps a ripe field and returns its food (0 when it was not ripe). */
  takeHarvest: (fieldId: number) => number;
  /** Counts wood brought to an open site as work; returns the seconds given. */
  haul: (siteId: number, wood: number) => number;
  /** Counts wood brought to an unfinished remote site as the crew's work; returns the seconds given. */
  haulRemote: (siteId: number, wood: number) => number;
  carry: HandCarry;
}

/** The farm's sheep as the hand reaches them; `Animals.hand` fits, with the pose passed on as numbers. */
export interface HandAnimals {
  /** The sheep free to lift within `radiusM` of (x, z), written to `out`. */
  sheepWithin: (
    x: number,
    z: number,
    radiusM: number,
    out: { id: number; x: number; z: number }[],
  ) => { id: number; x: number; z: number }[];
  lift: (id: number) => boolean;
  /** Where the carried sheep hangs this frame. */
  pose: (pose: CarriedPose) => void;
  /** `'back'` returns it to the flock; `'consumed'` is a delivery. */
  release: (how: 'back' | 'consumed') => void;
  holding: () => boolean;
}

export interface HandPorts {
  energy: HandEnergy;
  /** Where the orb is on the ground: the hand acts from there. */
  orb: () => Place;
  village: HandVillage;
  /** The farm's sheep; without it the hand lifts only trees and wheat. */
  animals?: HandAnimals;
  /** Who sees deeds, and whether the orb may win their belief. */
  deeds: DeedWorld;
  /** The skill tree's factors on reach and on cost (1 when it has none). */
  reachMul?: () => number;
  costMul?: () => number;
  /** True while the hand may not be used (a cutscene): a hold ends and nothing can be lifted. */
  blocked?: () => boolean;
  /** False while nobody is looking at what the hand would take (the roam hand is off): `update` then skips its look. */
  active?: () => boolean;
}

/** What a delivery came to. */
export interface Delivery {
  what: Held['kind'];
  /** Wood or food that arrived; wood hauled to a site counts as wood. */
  amount: number;
  /** How much of it the store had room for (all of it at a site, where it is work). */
  kept: number;
  zone: DropZone;
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
