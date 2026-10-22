// src/quests/finale.ts — the last night: the village gathers at the temple and the name returns
// (pure: no DOM, no game modules, node-runnable)
//
// Begins when every place of power is restored (the elder calls the village to the temple), and has two
// hidden steps: the gathering at dusk (the orb at the temple with energy, enough of the village believing and
// standing there), then the reveal, which the cutscene ends. No objective line and no way to fail: if the
// gathering is not met, the village waits for the next dusk.

import { PHASE0 } from '../config/phase0.ts';
import type { QuestDef } from './quest.ts';

const Q = PHASE0.QUEST;
const F = Q.FINALE;

/** The memory fragment told when the name has returned. */
export const FINALE_FRAGMENT = 23;

export const FINALE_QUEST: QuestDef = {
  id: 'name',
  title: 'The name returns',
  kind: 'finale',
  intro: 'finale-call',
  available: (ctx) => ctx.converted && ctx.allRestored,
  steps: [
    {
      id: 'gather',
      text: 'Gather at the temple at dusk.',
      hidden: true,
      advance: (p, _e, ctx) =>
        ctx.dusk &&
        ctx.orbAtTemple &&
        ctx.energy >= Q.OFFERING_MIN_ENERGY &&
        ctx.templeShare >= F.GATHER_SHARE
          ? 1
          : p,
    },
    {
      id: 'reveal',
      text: 'The name returns.',
      hidden: true,
      advance: (p, e) => (e.type === 'revealed' ? 1 : p),
      reward: { sparks: F.SPARKS, beat: 'finale-done', fragment: FINALE_FRAGMENT },
    },
  ],
};
