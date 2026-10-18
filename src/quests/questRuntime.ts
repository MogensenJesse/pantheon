// src/quests/questRuntime.ts — the conversion quest in the running game
//
// Feeds the pure rules (quest.ts) from the game: the elder meeting the orb, a Sign being cast, the
// energy offered at the temple, the villagers who believe. Steps give sparks, show story beats through
// the story log, and the last one converts the village.

import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { Activity } from '../world/village/model/types';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import {
  CONVERSION_QUEST,
  elderMeets,
  elderOpenToBelief,
  finishedQuestState,
  isDusk,
  type JournalRow,
  journalOf,
  newQuestState,
  type Objective,
  objectiveOf,
  offeringRate,
  type QuestEffects,
  type QuestEvent,
  type QuestState,
  stepQuest,
} from './quest';
import { STORY } from './story';

const Q = PHASE0.QUEST;
const TICK_S = 0.25;

export interface QuestRuntimeDeps {
  initial?: QuestState;
  village: Pick<VillageSystemContext, 'sim' | 'notice' | 'convert'>;
  /** Where the orb is. */
  orbPlace: () => { x: number; z: number };
  /** The village's day-cycle phase (0.75 sunset). */
  dayPhase: () => number;
  /** The game's phase (the meeting needs 1 or later). */
  gamePhase: () => number;
  energy: { amount: () => number; spend: (amount: number) => void };
  grantSparks: (count: number) => void;
}

export interface QuestRuntime {
  state: () => QuestState;
  objective: () => Objective | null;
  journal: () => JournalRow[];
  /** The orb has met the elder. */
  elderMet: () => boolean;
  /** Villager index of the elder, or -1. */
  elder: () => number;
  /** Whether the orb may raise this villager's belief now (the elder only in the last step). */
  canBelieve: (villager: number) => boolean;
  update: (dt: number) => void;
  dispose: () => void;
}

export function initQuest(deps: QuestRuntimeDeps): QuestRuntime {
  const { sim } = deps.village;
  const v = sim.villagers;
  let state: QuestState = deps.initial
    ? { ...deps.initial, beats: [...deps.initial.beats] }
    : newQuestState();
  let tickLeft = TICK_S;

  const temple = () => sim.buildings.find((b) => b.type === 'temple');
  const near = (m: number) => {
    const t = temple();
    const orb = deps.orbPlace();
    return !!t && Math.hypot(t.x - orb.x, t.z - orb.z) <= m;
  };
  const world = () => ({
    converts: sim.believers(),
    elderBelieves: sim.elder >= 0 && v.belief[sim.elder]! >= 1,
  });

  const apply = (effects: QuestEffects) => {
    if (effects.sparks > 0) deps.grantSparks(effects.sparks);
    for (const id of effects.beats) {
      const lines = STORY[id];
      if (lines) bus.emit('story:beat', { id, lines });
    }
    for (const id of effects.completed) bus.emit('quest:stepCompleted', { id });
    if (effects.questDone) deps.village.convert();
  };

  const dispatch = (event: QuestEvent) => {
    const before = state;
    const r = stepQuest(CONVERSION_QUEST, state, event, world());
    state = r.state;
    apply(r.effects);
    if (state.step !== before.step || Math.floor(state.progress) !== Math.floor(before.progress)) {
      bus.emit('quest:changed', {});
    }
  };

  const currentId = () => CONVERSION_QUEST.steps[state.step]?.id;

  const offBeliever = bus.on('village:villagerConverted', () => dispatch({ type: 'tick' }));
  const offSign = bus.on('ability:cast', ({ id }) => {
    if (id !== 'sign') return;
    dispatch({
      type: 'signCast',
      nearTemple: near(Q.FIRE_TEMPLE_M),
      dusk: isDusk(deps.dayPhase()),
    });
  });
  // A conversion that did not come from the quest (a DEV shortcut) ends the quest too.
  const offConverted = bus.on('village:converted', () => {
    if (state.done) return;
    state = { ...finishedQuestState(CONVERSION_QUEST), beats: state.beats };
    bus.emit('quest:changed', {});
  });

  const elderInfo = () => {
    const i = sim.elder;
    if (i < 0 || i >= v.count) return null;
    return { x: v.x[i]!, z: v.z[i]!, praying: v.activity[i] === Activity.Pray && !v.indoors[i] };
  };

  return {
    state: () => ({ ...state, beats: [...state.beats] }),
    objective: () => objectiveOf(CONVERSION_QUEST, state),
    journal: () => journalOf(CONVERSION_QUEST, state),
    elderMet: () => state.step > 0 || state.done,
    elder: () => sim.elder,
    canBelieve: (villager) => villager !== sim.elder || elderOpenToBelief(CONVERSION_QUEST, state),
    update: (dt) => {
      if (state.done) return;
      if (state.step === 0) {
        const orb = deps.orbPlace();
        if (elderMeets({ phase: deps.gamePhase(), elder: elderInfo(), orb })) {
          dispatch({ type: 'elderMet' });
          deps.village.notice(sim.elder, orb.x, orb.z, Q.ELDER_MEET_HOLD_S);
        }
        return;
      }
      if (currentId() === 'offering') {
        const rate = offeringRate({
          active: true,
          progress: state.progress,
          atTemple: near(Q.OFFERING_TEMPLE_M),
          energy: deps.energy.amount(),
        });
        if (rate > 0) {
          const amount = Math.min(rate * dt, Q.OFFERING_GOAL - state.progress);
          deps.energy.spend(amount);
          dispatch({ type: 'offered', amount });
        }
      }
      tickLeft -= dt;
      if (tickLeft <= 0) {
        tickLeft = TICK_S;
        dispatch({ type: 'tick' });
      }
    },
    dispose: () => {
      offBeliever();
      offSign();
      offConverted();
    },
  };
}
