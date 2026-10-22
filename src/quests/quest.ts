// src/quests/quest.ts — quests as data and rules: steps, progress, rewards, story beats
// (pure: no DOM, no game modules, node-runnable)
//
// A quest is a list of steps. The state is plain data (what a save keeps): the current step, how far
// into it, and the story beats already shown. `stepQuest` feeds it one event and one snapshot of the
// world and returns the new state and what happened (sparks, beats, steps done). A step only ever
// completes once, so nothing is rewarded twice.

import { PHASE0 } from '../config/phase0.ts';
import { isCount, isCountInt, isRecord } from '../core/guards.ts';
import { dist2d } from '../core/math/geom.ts';

const Q = PHASE0.QUEST;

export type QuestEvent =
  | { type: 'tick' }
  | { type: 'elderMet' }
  | { type: 'signCast'; nearTemple: boolean; dusk: boolean }
  | { type: 'offered'; amount: number }
  /** The player placed a plot (not the planner's own sites). */
  | { type: 'plotPlaced' }
  | { type: 'prayer'; need: string; state: 'opened' | 'answered' | 'lapsed' }
  /** `mended`: a lapsed believer or a prayer was set right; `aera`: the villager was Aera. */
  | { type: 'heartened'; villager: number; mended: boolean; aera: boolean }
  | { type: 'outpostDone'; kind: string }
  | { type: 'upgraded'; building: string; level: number }
  | { type: 'milestone'; id: string }
  | { type: 'awakened'; kind: string }
  | { type: 'restored'; kind: string }
  | { type: 'hunger'; stage: 'empty' | 'weak' | 'recovered' }
  /** The last night's cutscene has ended (or was skipped). */
  | { type: 'revealed' };

/** What the world looks like when an event arrives. */
export interface QuestContext {
  /** Villagers who believe now. */
  converts: number;
  elderBelieves: boolean;
  /** The village is converted (the conversion quest is done). */
  converted: boolean;
  /** Villagers in the village. */
  population: number;
  /** Milestones reached (ids from `skills/milestones.ts`). */
  milestones: readonly string[];
  /** Landmark kinds that are awake / restored. */
  awake: readonly string[];
  restored: readonly string[];
  /** Prayers open now. */
  prayersOpen: number;
  /** How hunger stands. */
  hunger: 'fed' | 'empty' | 'weak' | 'dying';
  /** Some finished building can be raised a level (the skill tree allows it). */
  upgradable: boolean;
  /** Every place of power on the map is restored. */
  allRestored: boolean;
  /** The last night: it is dusk, where the orb stands, its energy, and the share of the village gathered at the temple. */
  dusk: boolean;
  orbAtTemple: boolean;
  energy: number;
  templeShare: number;
}

export interface StepReward {
  sparks?: number;
  /** A story beat (a key in story.ts) shown when the step is done. */
  beat?: string;
  /** A memory fragment (its id in fragments.ts) to tell when the step is done. */
  fragment?: number;
}

export interface QuestStep {
  id: string;
  /** The objective line while the step is current. */
  text: string;
  /** Hidden steps show no objective (the meeting that starts the quest). */
  hidden?: boolean;
  /** Counted steps: the goal, shown as "n / goal". */
  goal?: number;
  /** The progress after an event: the step is done when it reaches `goal` (1 for a plain step). */
  advance: (progress: number, event: QuestEvent, ctx: QuestContext) => number;
  reward?: StepReward;
}

/** `main` quests show the objective line; the others are asked by the elder and show none. */
export type QuestKind = 'main' | 'teaching' | 'favour' | 'finale';

export interface QuestDef {
  id: string;
  title: string;
  kind: QuestKind;
  /** When the quest begins (checked on every event until it has); the default is a converted village. */
  available?: (ctx: QuestContext) => boolean;
  /** A story beat shown when the quest begins. */
  intro?: string;
  steps: readonly QuestStep[];
}

export interface QuestState {
  /** Index of the current step; `steps.length` once the quest is done. */
  step: number;
  /** Progress within the current step. */
  progress: number;
  done: boolean;
  /** Story beats already shown. */
  beats: string[];
}

export const newQuestState = (): QuestState => ({ step: 0, progress: 0, done: false, beats: [] });

/** A finished quest (a village that was already converted before the quest existed). */
export const finishedQuestState = (def: QuestDef): QuestState => ({
  step: def.steps.length,
  progress: 0,
  done: true,
  beats: [],
});

export interface QuestEffects {
  sparks: number;
  /** Beats shown now (new ones only), in order. */
  beats: string[];
  /** Memory fragments to tell now, in order. */
  fragments: number[];
  /** Ids of the steps completed by this event, in order. */
  completed: string[];
  /** The last step was completed. */
  questDone: boolean;
}

const goalOf = (step: QuestStep) => step.goal ?? 1;

/** Dusk: the hours around sunset, when the temple fire counts. */
export const isDusk = (dayPhase: number): boolean =>
  dayPhase >= PHASE0.DAY.SUNSET - Q.DUSK_BEFORE_SUNSET &&
  dayPhase <= PHASE0.DAY.SUNSET + Q.DUSK_AFTER_SUNSET;

/** The steps of the conversion quest (placeholder text). */
export const CONVERSION_QUEST: QuestDef = {
  id: 'conversion',
  title: 'The elder',
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
      text: 'Help the village believe.',
      goal: Q.CONVERTS_GOAL,
      advance: (p, _e, ctx) => Math.max(p, Math.min(Q.CONVERTS_GOAL, ctx.converts)),
      reward: { beat: 'convert-done' },
    },
    {
      id: 'fire',
      text: 'Light the temple fire at dusk with a Sign.',
      advance: (p, e) => (e.type === 'signCast' && e.nearTemple && e.dusk ? 1 : p),
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

/**
 * Feeds one event to the quest. Several steps can finish at once (the next one may already be true
 * when it begins), so the current step is asked again with a tick until nothing more completes.
 */
export function stepQuest(
  def: QuestDef,
  state: QuestState,
  event: QuestEvent,
  ctx: QuestContext,
): { state: QuestState; effects: QuestEffects } {
  const effects: QuestEffects = {
    sparks: 0,
    beats: [],
    fragments: [],
    completed: [],
    questDone: false,
  };
  if (state.done) return { state, effects };
  let step = state.step;
  let progress = state.progress;
  const beats = [...state.beats];
  let ev: QuestEvent = event;
  while (step < def.steps.length) {
    const current = def.steps[step] as QuestStep;
    const next = Math.max(progress, Math.min(goalOf(current), current.advance(progress, ev, ctx)));
    if (next < goalOf(current)) {
      progress = next;
      break;
    }
    effects.completed.push(current.id);
    effects.sparks += current.reward?.sparks ?? 0;
    const beat = current.reward?.beat;
    if (beat && !beats.includes(beat)) {
      beats.push(beat);
      effects.beats.push(beat);
    }
    const fragment = current.reward?.fragment;
    if (fragment !== undefined) effects.fragments.push(fragment);
    step++;
    progress = 0;
    ev = { type: 'tick' };
  }
  const done = step >= def.steps.length;
  effects.questDone = done;
  return { state: { step, progress, done, beats }, effects };
}

/** Sparks a convert is worth: one each after the first few. `converts` counts the new one. */
export function sparksForConvert(converts: number): number {
  return converts > Q.SPARKS_AFTER_CONVERTS ? 1 : 0;
}

export interface Objective {
  text: string;
  /** For counted steps. */
  value?: number;
  goal?: number;
}

/** The objective line, or null when there is none (before the meeting, and once the quest is done). */
export function objectiveOf(def: QuestDef, state: QuestState): Objective | null {
  if (state.done) return null;
  const step = def.steps[state.step];
  if (!step || step.hidden) return null;
  return step.goal
    ? { text: step.text, value: Math.floor(state.progress), goal: step.goal }
    : { text: step.text };
}

/** Whether the orb can win the elder's belief now (only in the last step, or once the quest is done). */
export function elderOpenToBelief(def: QuestDef, state: QuestState): boolean {
  return state.done || def.steps[state.step]?.id === 'believe';
}

/** Accepts a stored quest state or says it is damaged. */
export function parseQuest(
  raw: unknown,
  def: QuestDef = CONVERSION_QUEST,
): { ok: true; quest: QuestState } | { ok: false; message: string } {
  const bad = { ok: false as const, message: "The save's quest is damaged." };
  if (!isRecord(raw)) return bad;
  const { step, progress, done, beats } = raw;
  if (!isCountInt(step) || step > def.steps.length) return bad;
  if (!isCount(progress)) return bad;
  if (typeof done !== 'boolean' || done !== (step === def.steps.length)) return bad;
  if (!Array.isArray(beats) || !beats.every((b) => typeof b === 'string') || beats.length > 64) {
    return bad;
  }
  if (step < def.steps.length && progress > goalOf(def.steps[step] as QuestStep)) return bad;
  return { ok: true, quest: { step, progress, done, beats: [...(beats as string[])] } };
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
