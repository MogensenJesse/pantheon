// src/dev/runtime/questProbe.ts — DEV console hook: window.__pantheonQuest

import type { QuestRuntime } from '../../quests/questRuntime';
import type { VillageSim } from '../../world/village/sim/villageSim';
import { installDevHook } from './devHook';

export interface QuestProbeSources {
  quest: QuestRuntime;
  sim: VillageSim;
  /** Plays the finale's cutscene alone (no quest change). */
  playCutscene: ((done: () => void) => void) | null;
}

/** Install `window.__pantheonQuest`: the quests' state and objective, and where the elder and Aera are. */
export function initQuestProbe(src: QuestProbeSources): () => void {
  const { quest, sim } = src;
  /** A named villager's index, place and activity (null without one). */
  const villager = (i: number) => {
    if (i < 0) return null;
    const v = sim.villagers;
    return {
      index: i,
      x: v.x[i],
      z: v.z[i],
      activity: v.activity[i],
      indoors: !!v.indoors[i],
      belief: v.belief[i],
    };
  };
  const removeHook = installDevHook('__pantheonQuest', {
    state: () => quest.state(),
    objective: () => quest.objective(),
    elderMet: () => quest.elderMet(),
    elder: () => villager(sim.elder),
    aera: () => villager(sim.aera),
    canBelieve: (i: number) => quest.canBelieve(i),
    /** Plays the last night's cutscene on its own; resolves when it ends or is skipped. */
    playCutscene: () =>
      new Promise<void>((resolve) => {
        if (src.playCutscene) src.playCutscene(resolve);
        else resolve();
      }),
  });
  return removeHook;
}
