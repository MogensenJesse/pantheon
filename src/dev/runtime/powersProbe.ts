// src/dev/runtime/powersProbe.ts — DEV console hook: window.__pantheonPowers

import type { AbilityView } from '../../abilities/abilityView';
import type { CursorAim } from '../../abilities/builderPowers';
import type { CastResult } from '../../abilities/caster';
import { isHouse } from '../../world/village/model/buildings';
import type { VillageSim } from '../../world/village/sim/villageSim';
import { installDevHook } from './devHook';

export interface PowersProbeSources {
  /** The village powers: the player's list, and a cast at what the cursor is over. */
  builderList: () => AbilityView[];
  castBuilder: (id: string, aim: CursorAim) => CastResult;
  sim: VillageSim;
}

/** Install `window.__pantheonPowers`: the village powers, and the villagers' and houses' places. */
export function initPowersProbe(src: PowersProbeSources): () => void {
  const { sim } = src;
  const v = sim.villagers;
  const removeHook = installDevHook('__pantheonPowers', {
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
    /** The village powers the player has (name, cost, ready, cooldown). */
    builder: () => src.builderList(),
    /** Cast one at a place: `castBuilder('call_rain', { pick: null, ground: { x, z } })`. */
    castBuilder: (id: string, aim: CursorAim) => src.castBuilder(id, aim),
    houses: () => sim.buildings.filter(isHouse).map((b) => ({ id: b.id, x: b.x, z: b.z })),
  });
  return removeHook;
}
