// src/dev/runtime/questProbe.ts — DEV console hook: window.__pantheonQuest

import type { QuestRuntime } from '../../quests/questRuntime';
import type { VillageSim } from '../../world/village/sim/villageSim';
import { installDevHook } from './devHook';

export interface QuestProbeSources {
  quest: QuestRuntime;
  sim: VillageSim;
}

/** Install `window.__pantheonQuest`: the quests' state and objective, and where the elder is. */
export function initQuestProbe(src: QuestProbeSources): () => void {
  const { quest, sim } = src;
  const removeHook = installDevHook('__pantheonQuest', {
    state: () => quest.state(),
    objective: () => quest.objective(),
    elderMet: () => quest.elderMet(),
    /** The elder's index, place and activity (null without one). */
    elder: () => {
      const i = sim.elder;
      const v = sim.villagers;
      if (i < 0) return null;
      return {
        index: i,
        x: v.x[i],
        z: v.z[i],
        activity: v.activity[i],
        indoors: !!v.indoors[i],
        belief: v.belief[i],
      };
    },
    canBelieve: (i: number) => quest.canBelieve(i),
  });
  return removeHook;
}
