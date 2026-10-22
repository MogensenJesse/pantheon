// src/quests/teachingQuests.ts — the eight teaching quests, as data
// (pure: no DOM, no game modules, node-runnable)
//
// Each one introduces a mechanic the village has opened and is done by doing it once. They begin one at a
// time (see `startQuests`), show no objective line (the elder asks, in `SPEECH`), and pay a spark.
// The order here is the order they are offered when several are waiting.

import type { QuestDef } from './quest.ts';

export const TEACHING_QUESTS: readonly QuestDef[] = [
  {
    id: 'first-roof',
    title: 'A first roof',
    kind: 'teaching',
    intro: 'first-roof-ask',
    available: (ctx) => ctx.converted && ctx.milestones.includes('homes_10'),
    steps: [
      {
        id: 'plot',
        text: 'Mark a plot for a new house.',
        advance: (p, e) => (e.type === 'plotPlaced' ? 1 : p),
        reward: { sparks: 1, beat: 'first-roof-done' },
      },
    ],
  },
  {
    id: 'prayer-heard',
    title: 'A prayer heard',
    kind: 'teaching',
    intro: 'prayer-heard-ask',
    available: (ctx) => ctx.converted && ctx.prayersOpen > 0,
    steps: [
      {
        id: 'answer',
        text: "Answer a villager's prayer.",
        advance: (p, e) => (e.type === 'prayer' && e.state === 'answered' ? 1 : p),
        reward: { sparks: 1, beat: 'prayer-heard-done' },
      },
    ],
  },
  {
    id: 'the-touch',
    title: 'The touch',
    kind: 'teaching',
    intro: 'the-touch-ask',
    available: (ctx) => ctx.converted && ctx.milestones.includes('prayers_5'),
    steps: [
      {
        id: 'hearten',
        text: 'Hearten a villager who has lost their way.',
        advance: (p, e) => (e.type === 'heartened' && e.mended ? 1 : p),
        reward: { sparks: 1, beat: 'the-touch-done' },
      },
    ],
  },
  {
    id: 'raised',
    title: 'Raised',
    kind: 'teaching',
    intro: 'raised-ask',
    available: (ctx) => ctx.converted && ctx.upgradable,
    steps: [
      {
        id: 'raise',
        text: 'Raise a building to level 2.',
        advance: (p, _e, ctx) => (ctx.milestones.includes('level_2') ? 1 : p),
        reward: { sparks: 1, beat: 'raised-done' },
      },
    ],
  },
  {
    id: 'first-place',
    title: 'The first place',
    kind: 'teaching',
    intro: 'first-place-ask',
    available: (ctx) => ctx.converted && ctx.awake.length > 0,
    steps: [
      {
        id: 'restore',
        text: 'Restore your first place of power.',
        advance: (p, _e, ctx) => (ctx.milestones.includes('first_place') ? 1 : p),
        reward: { sparks: 1, beat: 'first-place-done' },
      },
    ],
  },
  {
    id: 'beyond-fence',
    title: 'Beyond the fence',
    kind: 'teaching',
    intro: 'beyond-fence-ask',
    available: (ctx) => ctx.converted && ctx.milestones.includes('first_place'),
    steps: [
      {
        id: 'outpost',
        text: 'Mark a lumber camp or a fishing hut.',
        advance: (p, e) => (e.type === 'outpostDone' ? 1 : p),
        reward: { sparks: 1, beat: 'beyond-fence-done' },
      },
    ],
  },
  {
    id: 'hard-winter',
    title: 'A hard winter',
    kind: 'teaching',
    intro: 'hard-winter-ask',
    available: (ctx) => ctx.converted && ctx.hunger !== 'fed',
    steps: [
      {
        id: 'recover',
        text: 'Feed the village again.',
        advance: (p, e) => (e.type === 'hunger' && e.stage === 'recovered' ? 1 : p),
        reward: { sparks: 1, beat: 'hard-winter-done' },
      },
    ],
  },
  {
    id: 'many-hands',
    title: 'Many hands',
    kind: 'teaching',
    intro: 'many-hands-ask',
    available: (ctx) => ctx.converted && ctx.population >= 15,
    steps: [
      {
        id: 'grow',
        text: 'Twenty souls dwell here.',
        advance: (p, _e, ctx) => (ctx.milestones.includes('folk_20') ? 1 : p),
        reward: { sparks: 1, beat: 'many-hands-done' },
      },
    ],
  },
];
