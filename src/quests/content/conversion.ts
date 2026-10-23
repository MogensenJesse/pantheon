// src/quests/content/conversion.ts — the conversion quest: the elder, five believers, the temple fire, the
// offering and the elder's heart (pure: no DOM, no game modules, node-runnable)
//
// The main quest, the one with an objective line. Finishing it converts the village. Its helpers are the
// rules the runtime feeds it with: when the elder notices the orb, how much energy flows into the offering,
// what a convert is worth.

import { PHASE0 } from '../../config/phase0.ts';
import { dist2d } from '../../core/math/geom.ts';
import type { QuestDef, QuestState } from '../quest.ts';

const Q = PHASE0.QUEST;

/** Dusk: the hours around sunset, when the temple fire counts. */
export const isDusk = (dayPhase: number): boolean =>
  dayPhase >= PHASE0.DAY.SUNSET - Q.DUSK_BEFORE_SUNSET &&
  dayPhase <= PHASE0.DAY.SUNSET + Q.DUSK_AFTER_SUNSET;

/** The steps of the conversion quest (placeholder text). */
export const CONVERSION_QUEST: QuestDef = {
  id: 'conversion',
  kind: 'main',
  available: () => true,
  steps: [
    {
      id: 'meet',
      text: 'Find the elder at the temple.',
      hidden: true,
      advance: (p, e) => (e.type === 'elderMet' ? 1 : p),
      reward: { sparks: 1, beat: 'elder-meets' },
    },
    {
      id: 'convert',
      text: 'Impress five villagers.',
      goal: Q.CONVERTS_GOAL,
      advance: (p, _e, ctx) => Math.max(p, Math.min(Q.CONVERTS_GOAL, ctx.converts)),
      reward: { beat: 'convert-done' },
    },
    {
      id: 'fire',
      text: 'Bring wood to the temple at dusk.',
      advance: (p, e) => (e.type === 'deed' && e.what === 'tree' && e.nearTemple && e.dusk ? 1 : p),
      reward: { sparks: 1, beat: 'fire-lit' },
    },
    {
      id: 'offering',
      text: 'Make an offering at the temple.',
      goal: Q.OFFERING_GOAL,
      advance: (p, e) =>
        e.type === 'offered' ? Math.min(Q.OFFERING_GOAL, p + Math.max(0, e.amount)) : p,
      reward: { sparks: 1, beat: 'offering-made' },
    },
    {
      id: 'believe',
      text: "Win the elder's heart.",
      advance: (p, _e, ctx) => (ctx.elderBelieves ? 1 : p),
      reward: { beat: 'village-converted' },
    },
  ],
};

/** Sparks a convert is worth: one each after the first few. `converts` counts the new one. */
export function sparksForConvert(converts: number): number {
  return converts > Q.SPARKS_AFTER_CONVERTS ? 1 : 0;
}

/** Whether the orb can win the elder's belief now (only in the last step, or once the quest is done). */
export function elderOpenToBelief(def: QuestDef, state: QuestState): boolean {
  return state.done || def.steps[state.step]?.id === 'believe';
}

/** The elder notices the orb: close enough, praying, and the game is past the first phase. */
export function elderMeets(o: {
  phase: number;
  elder: { x: number; z: number; praying: boolean } | null;
  orb: { x: number; z: number };
}): boolean {
  if (o.phase < 1 || !o.elder || !o.elder.praying) return false;
  return dist2d(o.elder, o.orb) <= Q.ELDER_MEET_M;
}

/** Energy per second flowing into the offering right now (0 when it cannot flow). */
export function offeringRate(o: {
  /** The offering is the current step. */
  active: boolean;
  progress: number;
  /** The orb is within reach of the temple. */
  atTemple: boolean;
  energy: number;
}): number {
  if (!o.active || !o.atTemple || o.energy <= 0) return 0;
  // It begins with a full measure of energy, and carries on with whatever is left.
  if (o.progress <= 0 && o.energy < Q.OFFERING_MIN_ENERGY) return 0;
  return Math.min(Q.OFFERING_PER_SEC, o.energy);
}
