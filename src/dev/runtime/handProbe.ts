// src/dev/runtime/handProbe.ts — DEV console hook: window.__pantheonHand
//
// Drives the orb's hand without a mouse or a look at the screen: where it would reach, lift, put down and
// cancel, and what the village made of it. `goTo`, `goToTree`, `goToField` and `goToSheep` move the orb.

import type { HandRuntime } from '../../hand/handRuntime';
import type { AnimalHand } from '../../life/animals/animals';
import type { HandUi } from '../../ui/hand/handUi';
import { isRipe } from '../../world/village/sim/fieldsDesk';
import type { VillageSim } from '../../world/village/sim/villageSim';
import { installDevHook } from './devHook';

export interface HandProbeSources {
  runtime: HandRuntime;
  ui: HandUi;
  sim: VillageSim;
  sheep: AnimalHand;
  teleport: (x: number, z: number) => void;
  orbPlace: () => { x: number; z: number };
  energy: () => number;
  setEnergy: (value: number) => void;
}

export function initHandProbe(src: HandProbeSources): () => void {
  const { runtime, sim } = src;
  const forest = sim.forest;
  const trees: number[] = [];
  return installDevHook('__pantheonHand', {
    /** The hold, what the next lift would take, where a put-down would go, and the energy. */
    state: () => ({
      held: runtime.held(),
      target: runtime.target(),
      zone: runtime.zone(),
      energy: src.energy(),
      onHold: runtime.energyOnHold(),
      orb: src.orbPlace(),
    }),
    /** The standing trees within `radiusM` (default 15) of the orb, nearest first. */
    nearby: (radiusM = 15) => {
      const orb = src.orbPlace();
      return forest
        .within(orb.x, orb.z, radiusM, trees)
        .map((id) => ({ id, d: Math.hypot(forest.info(id).x - orb.x, forest.info(id).z - orb.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 12);
    },
    /** The sheep free to lift within `radiusM` (default 40) of the orb. */
    sheep: (radiusM = 40) => {
      const orb = src.orbPlace();
      return src.sheep.sheepWithin(orb.x, orb.z, radiusM, []);
    },
    /** Moves the orb onto sheep `id` (see `sheep()`). */
    goToSheep: (id: number) => {
      const orb = src.orbPlace();
      const spot = src.sheep.sheepWithin(orb.x, orb.z, 1e6, []).find((s) => s.id === id);
      if (spot) src.teleport(spot.x, spot.z);
      return !!spot;
    },
    /** The fields, how far each has grown and whether the hand would lift it. */
    fields: () =>
      sim.fields.map((f) => ({
        id: f.id,
        x: f.x,
        z: f.z,
        growth: f.growth,
        ripe: isRipe(f.growth),
      })),
    /** Moves the orb into field `id`. */
    goToField: (id: number) => {
      const f = sim.fields.find((x) => x.id === id);
      if (f) src.teleport(f.x, f.z);
      return !!f;
    },
    /** Lifts what is in reach, as the F key does (toast and all). */
    grab: () => src.ui.lift(),
    /** Puts it down where the orb is. */
    drop: () => src.ui.putDown(),
    /** Moves the orb to a place and puts it down there. */
    dropAt: (x: number, z: number) => {
      src.teleport(x, z);
      return src.ui.putDown();
    },
    /** The overview's clicks without the overview: lift or put down at a point while the orb stays where it is. */
    liftAt: (x: number, z: number) => src.ui.lift({ x, z }),
    putDownAt: (x: number, z: number) => src.ui.putDown({ x, z }),
    /** What a click at a point would lift (null while something is held). */
    targetAt: (x: number, z: number) => runtime.targetAt({ x, z }),
    /** Puts the held thing back on purpose (the overview's Esc): the effort is lost. */
    putBack: () => src.ui.putBack(),
    goTo: (x: number, z: number) => src.teleport(x, z),
    /** Moves the orb beside tree `id`. */
    goToTree: (id: number) => {
      const t = forest.info(id);
      src.teleport(t.x + 1, t.z);
    },
    /** The game takes the held thing away: the world is as it was and the energy returns. */
    cancel: () => runtime.cancel(),
    setEnergy: (value: number) => src.setEnergy(value),
    /** The villagers' belief, and how long each has to wait before the next lift or delivery impresses them. */
    deeds: () =>
      Array.from({ length: sim.villagers.count }, (_, i) => ({
        i,
        belief: sim.villagers.belief[i]!,
        liftWait: runtime.deeds.cooldown(i, 'lift'),
        deliverWait: runtime.deeds.cooldown(i, 'deliver'),
      })),
  });
}
