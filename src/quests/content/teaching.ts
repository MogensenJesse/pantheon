// src/quests/content/teaching.ts — the eight teaching quests, as data
// (pure: no DOM, no game modules, node-runnable)
//
// Each one introduces a mechanic the village has opened and is done by doing it once. They begin one at a
// time (see `startQuests`), show no objective line (the elder asks, in `story.ts`), and pay a spark.
// The order here is the order they are offered when several are waiting.

import { PHASE0 } from '../../config/phase0.ts';
import type { QuestDef } from '../quest.ts';
import { oneStepQuest, reached } from './questBuilders.ts';

export const TEACHING_QUESTS: readonly QuestDef[] = [
  oneStepQuest({
    id: 'first-roof',
    kind: 'teaching',
    available: (ctx) => reached(ctx, 'homes_10'),
    step: {
      id: 'plot',
      text: 'Mark a plot for a new house.',
      advance: (p, e) => (e.type === 'plotPlaced' ? 1 : p),
    },
  }),
  oneStepQuest({
    id: 'prayer-heard',
    kind: 'teaching',
    available: (ctx) => ctx.prayersOpen > 0,
    step: {
      id: 'answer',
      text: "Answer a villager's prayer.",
      advance: (p, e) => (e.type === 'prayer' && e.state === 'answered' ? 1 : p),
    },
  }),
  oneStepQuest({
    id: 'the-touch',
    kind: 'teaching',
    available: (ctx) => reached(ctx, 'prayers_5'),
    step: {
      id: 'hearten',
      text: 'Hearten a villager who has lost their way.',
      advance: (p, e) => (e.type === 'heartened' && e.mended ? 1 : p),
    },
  }),
  oneStepQuest({
    id: 'raised',
    kind: 'teaching',
    available: (ctx) => ctx.upgradable,
    step: {
      id: 'raise',
      text: 'Raise a building to level 2.',
      advance: (p, _e, ctx) => (reached(ctx, 'level_2') ? 1 : p),
    },
  }),
  oneStepQuest({
    id: 'first-place',
    kind: 'teaching',
    available: (ctx) => ctx.awake.length > 0,
    step: {
      id: 'restore',
      text: 'Restore your first place of power.',
      advance: (p, _e, ctx) => (reached(ctx, 'first_place') ? 1 : p),
    },
  }),
  oneStepQuest({
    id: 'beyond-fence',
    kind: 'teaching',
    available: (ctx) => reached(ctx, 'first_place'),
    step: {
      id: 'outpost',
      text: 'Mark a lumber camp or a fishing hut.',
      advance: (p, e) => (e.type === 'outpostDone' ? 1 : p),
    },
  }),
  oneStepQuest({
    id: 'hard-winter',
    kind: 'teaching',
    available: (ctx) => ctx.hunger !== 'fed',
    step: {
      id: 'recover',
      text: 'Feed the village again.',
      advance: (p, e) => (e.type === 'hunger' && e.stage === 'recovered' ? 1 : p),
    },
  }),
  oneStepQuest({
    id: 'many-hands',
    kind: 'teaching',
    available: (ctx) => ctx.population >= PHASE0.QUEST.MANY_HANDS_FROM,
    step: {
      id: 'grow',
      text: 'Twenty souls dwell here.',
      advance: (p, _e, ctx) => (reached(ctx, 'folk_20') ? 1 : p),
    },
  }),
];
