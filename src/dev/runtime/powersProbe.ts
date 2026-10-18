// src/dev/runtime/powersProbe.ts — DEV console hook: window.__pantheonPowers

import type { Powers } from '../../abilities/powers';
import { isHouse } from '../../world/village/model/buildings';
import type { VillageSim } from '../../world/village/sim/villageSim';

export interface PowersProbeSources {
  powers: Powers;
  sim: VillageSim;
  orbPlace: () => { x: number; z: number };
}

/** Install `window.__pantheonPowers`: who the powers would reach, the night count, and the villagers' places. */
export function initPowersProbe(src: PowersProbeSources): () => void {
  const win = window as unknown as Record<string, unknown>;
  const { powers, sim } = src;
  const v = sim.villagers;
  win.__pantheonPowers = {
    /** The villager and house the next Murmur and Dream would reach (-1 none). */
    reach: () => {
      const orb = src.orbPlace();
      return { villager: powers.murmurTarget(orb), house: powers.dreamTarget(orb) };
    },
    murmurActive: () => powers.murmur.active(),
    murmurTarget: () => powers.murmur.target(),
    isNight: () => powers.night.isNight(),
    nightId: () => powers.night.id(),
    /** Every villager: place, indoors, belief, activity, yaw and where they live. */
    villagers: () =>
      Array.from({ length: v.count }, (_, i) => ({
        i,
        x: v.x[i]!,
        z: v.z[i]!,
        yaw: v.yaw[i]!,
        indoors: v.indoors[i] === 1,
        belief: v.belief[i]!,
        activity: v.activity[i]!,
        mode: v.mode[i]!,
        home: v.home[i]!,
      })),
    houses: () => sim.buildings.filter(isHouse).map((b) => ({ id: b.id, x: b.x, z: b.z })),
  };
  return () => {
    delete win.__pantheonPowers;
  };
}
