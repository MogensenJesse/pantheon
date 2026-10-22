// src/quests/favourQuests.ts — Caros's five favours, as data
// (pure: no DOM, no game modules, node-runnable)
//
// One favour for each place of power: the elder asks once the place is awake and the village is
// converted, and pays a spark and a memory fragment when it is done. They show no objective line.

import type { LandmarkKind } from '../map/MapTypes.ts';
import type { QuestDef, QuestEvent, QuestStep } from './quest.ts';

/** The memory fragment each favour tells (ids follow the landmark chapters and `UNFINISHED_MEMORY_ID`). */
export const FAVOUR_FRAGMENTS: Readonly<Record<LandmarkKind, number>> = {
  runestones: 18,
  tree: 19,
  temple_ruin: 20,
  sunken_ruin: 21,
  monolith: 22,
};

const favour = (
  kind: LandmarkKind,
  title: string,
  step: Pick<QuestStep, 'text' | 'goal' | 'advance'>,
): QuestDef => ({
  id: `favour-${kind}`,
  title,
  kind: 'favour',
  intro: `favour-${kind}-ask`,
  available: (ctx) => ctx.converted && ctx.awake.includes(kind),
  steps: [
    {
      id: 'favour',
      ...step,
      reward: { sparks: 1, beat: `favour-${kind}-done`, fragment: FAVOUR_FRAGMENTS[kind] },
    },
  ],
});

const answered = (e: QuestEvent) => e.type === 'prayer' && e.state === 'answered';

export const FAVOUR_QUESTS: readonly QuestDef[] = [
  favour('runestones', 'Thinning prayers', {
    text: 'Answer three prayers.',
    goal: 3,
    advance: (p, e) => (answered(e) ? p + 1 : p),
  }),
  favour('tree', 'A dry spell', {
    text: 'Answer a prayer for rain.',
    advance: (p, e) => (e.type === 'prayer' && e.state === 'answered' && e.need === 'rain' ? 1 : p),
  }),
  favour('temple_ruin', 'A better roof', {
    text: 'Raise a house to level 2.',
    advance: (p, e) =>
      e.type === 'upgraded' && e.building.startsWith('house') && e.level >= 2 ? 1 : p,
  }),
  favour('sunken_ruin', 'From the water', {
    text: 'Build a fishing hut.',
    advance: (p, e) => (e.type === 'outpostDone' && e.kind === 'fishing' ? 1 : p),
  }),
  favour('monolith', 'The shepherd girl', {
    text: 'Hearten Aera.',
    advance: (p, e) => (e.type === 'heartened' && e.aera ? 1 : p),
  }),
];
