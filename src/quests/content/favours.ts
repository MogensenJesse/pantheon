// src/quests/content/favours.ts — Caros's five favours, as data
// (pure: no DOM, no game modules, node-runnable)
//
// One favour for each place of power: the elder asks once the place is awake and the village is
// converted, and pays a spark and a memory fragment when it is done. They show no objective line.

import type { LandmarkKind } from '../../map/MapTypes.ts';
import { FRAGMENT_IDS } from '../../story/fragments.ts';
import { isHouse } from '../../world/village/model/buildings.ts';
import type { QuestDef, QuestEvent, QuestStep } from '../quest.ts';
import { oneStepQuest } from './questBuilders.ts';

const favour = (kind: LandmarkKind, step: Pick<QuestStep, 'text' | 'goal' | 'advance'>): QuestDef =>
  oneStepQuest({
    id: `favour-${kind}`,
    kind: 'favour',
    available: (ctx) => ctx.awake.includes(kind),
    step: { id: 'favour', ...step },
    fragment: FRAGMENT_IDS.favour[kind],
  });

/** A prayer was answered (and what it asked for). */
const answered = (e: QuestEvent): e is Extract<QuestEvent, { type: 'prayer' }> =>
  e.type === 'prayer' && e.state === 'answered';

export const FAVOUR_QUESTS: readonly QuestDef[] = [
  favour('runestones', {
    text: 'Answer three prayers.',
    goal: 3,
    advance: (p, e) => (answered(e) ? p + 1 : p),
  }),
  favour('tree', {
    text: 'Answer a prayer for rain.',
    advance: (p, e) => (answered(e) && e.need === 'rain' ? 1 : p),
  }),
  favour('temple_ruin', {
    text: 'Raise a house to level 2.',
    advance: (p, e) =>
      e.type === 'upgraded' && isHouse({ type: e.building }) && e.level >= 2 ? 1 : p,
  }),
  favour('sunken_ruin', {
    text: 'Build a fishing hut.',
    advance: (p, e) => (e.type === 'outpostDone' && e.kind === 'fishing' ? 1 : p),
  }),
  favour('monolith', {
    text: 'Hearten Aera.',
    advance: (p, e) => (e.type === 'heartened' && e.aera ? 1 : p),
  }),
];
