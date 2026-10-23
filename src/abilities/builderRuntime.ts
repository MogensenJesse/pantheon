// src/abilities/builderRuntime.ts — the arch II powers wired to the running village
//
// The village's faith pays for them, the builder powers do what they do to the village and the weather,
// and the overview asks for the list and casts through here.

import type { VillageSystemContext } from '../world/village/VillageSystem';
import type { Weather } from '../world/weather/weather.ts';
import { abilityById } from './abilities.ts';
import type { AbilityRuntime } from './abilityRuntime';
import { type AbilityView, abilityView } from './abilityView.ts';
import { type BuilderPowers, type CursorAim, createBuilderPowers } from './builderPowers.ts';
import type { CastResult } from './caster.ts';

export interface BuilderRuntime {
  /** The arch II powers the player has. */
  list: () => AbilityView[];
  /** Casts one at what the cursor is over. */
  cast: (id: string, aim: CursorAim) => CastResult;
  /** What a village power does, for the ability runtime's performer. */
  perform: BuilderPowers['perform'];
}

/** Null without a village. Also tells the ability runtime where faith comes from. */
export function initBuilderRuntime(o: {
  abilities: AbilityRuntime;
  village: VillageSystemContext | null;
  weather: Weather;
  clock: () => number;
  windDirectionDeg: number;
}): BuilderRuntime | null {
  const { abilities, village } = o;
  if (!village) return null;
  const builder = createBuilderPowers({
    weather: o.weather,
    clock: o.clock,
    windDirectionDeg: o.windDirectionDeg,
  });
  abilities.setFaith({
    amount: () => village.sim.faith.faith,
    spend: (amount) => village.addFaith(-amount),
  });
  return {
    list: () =>
      abilities.defs
        .filter((def) => def.arch === 'village' && abilities.isGranted(def.id))
        .map((def) => abilityView(def, abilities.status(def.id))),
    cast: (id, aim) => {
      const def = abilityById(id);
      if (!def) return { ok: false, reason: 'unknown' };
      return abilities.cast(id, builder.resolveTarget(def, aim));
    },
    perform: builder.perform,
  };
}
