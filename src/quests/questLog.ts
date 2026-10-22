// src/quests/questLog.ts — several quests at once: which have begun, how each stands, what a save keeps
// (pure: no DOM, no game modules, node-runnable)
//
// A quest begins once its `available` rule is true and then runs on its own state. The log is a plain
// record by quest id: a quest not in it has not begun. Every quest only ever completes its steps once,
// so feeding the same world again pays nothing twice.

import { isRecord } from '../core/guards.ts';
import {
  newQuestState,
  parseQuest,
  type QuestContext,
  type QuestDef,
  type QuestEffects,
  type QuestEvent,
  type QuestState,
  stepQuest,
} from './quest.ts';

export type QuestsState = Readonly<Record<string, QuestState>>;

/** What one quest did on an event (or by beginning). */
export interface QuestOutcome {
  id: string;
  effects: QuestEffects;
}

const noEffects = (): QuestEffects => ({
  sparks: 0,
  beats: [],
  fragments: [],
  completed: [],
  questDone: false,
});

/** A copy of the log that can be kept while the game runs on. */
export const copyQuests = (states: QuestsState): QuestsState =>
  Object.fromEntries(Object.entries(states).map(([id, q]) => [id, { ...q, beats: [...q.beats] }]));

/** Begins the quests whose rule is true now: each gets a fresh state and shows its intro beat. */
export function startQuests(
  defs: readonly QuestDef[],
  states: QuestsState,
  ctx: QuestContext,
): { states: QuestsState; started: QuestOutcome[] } {
  let next: Record<string, QuestState> | null = null;
  const started: QuestOutcome[] = [];
  for (const def of defs) {
    if (states[def.id]) continue;
    const available = def.available ? def.available(ctx) : ctx.converted;
    if (!available) continue;
    next ??= { ...states };
    const state = newQuestState();
    const effects = noEffects();
    if (def.intro) {
      state.beats.push(def.intro);
      effects.beats.push(def.intro);
    }
    next[def.id] = state;
    started.push({ id: def.id, effects });
  }
  return { states: next ?? states, started };
}

/**
 * Feeds one event to every quest that has begun and is not done. Quests that did not move keep their
 * state object, so the caller can tell by identity.
 */
export function stepQuests(
  defs: readonly QuestDef[],
  states: QuestsState,
  event: QuestEvent,
  ctx: QuestContext,
): { states: QuestsState; outcomes: QuestOutcome[] } {
  let next: Record<string, QuestState> | null = null;
  const outcomes: QuestOutcome[] = [];
  for (const def of defs) {
    const state = states[def.id];
    if (!state || state.done) continue;
    const r = stepQuest(def, state, event, ctx);
    const moved = r.state.step !== state.step || r.state.progress !== state.progress;
    if (moved) {
      next ??= { ...states };
      next[def.id] = r.state;
    }
    const e = r.effects;
    if (e.sparks || e.beats.length || e.fragments.length || e.completed.length || e.questDone) {
      outcomes.push({ id: def.id, effects: e });
    }
  }
  return { states: next ?? states, outcomes };
}

/** Ids of the quests that are done. */
export const finishedQuests = (states: QuestsState): string[] =>
  Object.entries(states)
    .filter(([, q]) => q.done)
    .map(([id]) => id);

/** Accepts a stored log or says it is damaged. A quest this game does not know is left out. */
export function parseQuests(
  raw: unknown,
  defs: readonly QuestDef[],
): { ok: true; quests: QuestsState } | { ok: false; message: string } {
  const bad = { ok: false as const, message: "The save's quests are damaged." };
  if (!isRecord(raw)) return bad;
  const out: Record<string, QuestState> = {};
  for (const [id, value] of Object.entries(raw)) {
    const def = defs.find((d) => d.id === id);
    if (!def) continue;
    const parsed = parseQuest(value, def);
    if (!parsed.ok) return bad;
    out[id] = parsed.quest;
  }
  return { ok: true, quests: out };
}
