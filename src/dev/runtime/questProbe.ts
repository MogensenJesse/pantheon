// src/dev/runtime/questProbe.ts — DEV console hook: window.__pantheonQuest

import type { QuestRuntime } from '../../quests/questRuntime';
import type { VillageSim } from '../../world/village/sim/villageSim';

export interface QuestProbeSources {
  quest: QuestRuntime;
  sim: VillageSim;
}

/** Install `window.__pantheonQuest`: the quest's state, objective and journal, and where the elder is. */
export function initQuestProbe(src: QuestProbeSources): () => void {
  const win = window as unknown as Record<string, unknown>;
  const { quest, sim } = src;
  win.__pantheonQuest = {
    state: () => quest.state(),
    objective: () => quest.objective(),
    journal: () => quest.journal(),
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
  };
  return () => {
    delete win.__pantheonQuest;
  };
}
