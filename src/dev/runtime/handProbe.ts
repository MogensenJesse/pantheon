// src/dev/runtime/handProbe.ts — DEV console hook: window.__pantheonHand
//
// Drives the orb's hand without a mouse or a look at the screen: where it would reach, lift, put down and
// cancel, and what the village made of it. `goToTree` and `goTo` move the orb.

import type { HandRuntime } from '../../hand/handRuntime';
import type { HandUi } from '../../ui/hand/handUi';
import type { VillageSim } from '../../world/village/sim/villageSim';
import { installDevHook } from './devHook';

export interface HandProbeSources {
  runtime: HandRuntime;
  ui: HandUi;
  sim: VillageSim;
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
    /** Lifts what is in reach, as the F key does (toast and all). */
    grab: () => src.ui.lift(),
    /** Puts it down where the orb is. */
    drop: () => src.ui.putDown(),
    /** Moves the orb to a place and puts it down there. */
    dropAt: (x: number, z: number) => {
      src.teleport(x, z);
      return src.ui.putDown();
    },
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
