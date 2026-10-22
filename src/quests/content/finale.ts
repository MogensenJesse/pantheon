// src/quests/content/finale.ts — the last night: the village gathers at the temple and the name returns
// (pure: no DOM, no game modules, node-runnable)
//
// Begins when every place of power is restored (the elder calls the village to the temple), and has two
// hidden steps: the gathering at dusk (the orb at the temple with energy, enough of the village believing and
// standing there), then the reveal, which the cutscene ends. No objective line and no way to fail: if the
// gathering is not met, the village waits for the next dusk.

import { PHASE0 } from '../../config/phase0.ts';
import { FRAGMENT_IDS } from '../../story/fragments.ts';
import type { QuestDef } from '../quest.ts';

const F = PHASE0.QUEST.FINALE;

export const FINALE_QUEST: QuestDef = {
  id: 'name',
  kind: 'finale',
  intro: 'finale-call',
  available: (ctx) => ctx.allRestored,
  steps: [
    {
      id: 'gather',
      text: 'Gather at the temple at dusk.',
      hidden: true,
      advance: (p, _e, ctx) =>
        ctx.dusk &&
        ctx.orbAtTemple &&
        ctx.energy >= F.MIN_ENERGY &&
        ctx.templeShare >= F.GATHER_SHARE
          ? 1
          : p,
    },
    {
      id: 'reveal',
      text: 'The name returns.',
      hidden: true,
      advance: (p, e) => (e.type === 'revealed' ? 1 : p),
      reward: { sparks: F.SPARKS, beat: 'finale-done', fragment: FRAGMENT_IDS.nameReturned },
    },
  ],
};
