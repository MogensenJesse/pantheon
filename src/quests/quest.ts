// src/quests/quest.ts — quests as data and rules: steps, progress, rewards, story beats
// (pure: no DOM, no game modules, node-runnable)
//
// A quest is a list of steps. The state is plain data (what a save keeps): the current step and how far
// into it. `stepQuest` feeds it one event and one snapshot of the world and returns the new state and
// what happened (sparks, beats, steps done). A step only ever completes once, so nothing is rewarded
// twice. The quests themselves are in `content/`.

import { isCount, isCountInt, isRecord } from '../core/guards.ts';
import type { HandKind } from '../hand/handTypes.ts';
import type { VillageBuildingType } from '../world/village/model/assetKeys.ts';
import type { OutpostKind } from '../world/village/sim/outposts.ts';

export type QuestEvent =
  /** Nothing happened: ask again (the world may have changed). */
  | { type: 'tick' }
  | { type: 'elderMet' }
  | { type: 'signCast'; nearTemple: boolean; dusk: boolean }
  /** The orb's hand put `what` down in the village; `nearTemple` and `dusk` say where and when. */
  | { type: 'deed'; what: HandKind; nearTemple: boolean; dusk: boolean }
  | { type: 'offered'; amount: number }
  /** The player placed a plot (not the planner's own sites). */
  | { type: 'plotPlaced' }
  | { type: 'prayer'; need: 'food' | 'rain' | 'shelter'; state: 'opened' | 'answered' | 'lapsed' }
  /** `mended`: a lapsed believer or a prayer was set right; `aera`: the villager was Aera. */
  | { type: 'heartened'; mended: boolean; aera: boolean }
  | { type: 'outpostDone'; kind: OutpostKind }
  | { type: 'upgraded'; building: VillageBuildingType; level: number }
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
  /** Landmark kinds that are awake. */
  awake: readonly string[];
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
  kind: QuestKind;
  /**
   * When the quest begins (checked on every event until it has). Every quest but the main one also needs
   * a converted village; this is the rest of its rule.
   */
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
}

export const newQuestState = (): QuestState => ({ step: 0, progress: 0, done: false });

/** A finished quest (a village that was already converted before the quest existed). */
export const finishedQuestState = (def: QuestDef): QuestState => ({
  step: def.steps.length,
  progress: 0,
  done: true,
});

export interface QuestEffects {
  sparks: number;
  /** Beats shown now, in order. */
  beats: string[];
  /** Memory fragments to tell now, in order. */
  fragments: number[];
  /** Ids of the steps completed by this event, in order. */
  completed: string[];
  /** The last step was completed. */
  questDone: boolean;
}

const goalOf = (step: QuestStep) => step.goal ?? 1;

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
    if (current.reward?.beat) effects.beats.push(current.reward.beat);
    if (current.reward?.fragment !== undefined) effects.fragments.push(current.reward.fragment);
    step++;
    progress = 0;
    ev = { type: 'tick' };
  }
  const done = step >= def.steps.length;
  effects.questDone = done;
  return { state: { step, progress, done }, effects };
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

/** Accepts a stored quest state or says it is damaged. */
export function parseQuest(
  raw: unknown,
  def: QuestDef,
): { ok: true; quest: QuestState } | { ok: false; message: string } {
  const bad = { ok: false as const, message: "The save's quest is damaged." };
  if (!isRecord(raw)) return bad;
  const { step, progress, done } = raw;
  if (!isCountInt(step) || step > def.steps.length) return bad;
  if (!isCount(progress)) return bad;
  if (typeof done !== 'boolean' || done !== (step === def.steps.length)) return bad;
  if (step < def.steps.length && progress > goalOf(def.steps[step] as QuestStep)) return bad;
  return { ok: true, quest: { step, progress, done } };
}
