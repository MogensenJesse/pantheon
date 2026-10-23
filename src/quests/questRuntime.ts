// src/quests/questRuntime.ts — the quests in the running game
//
// Feeds the pure rules (quest.ts, questLog.ts) from the game: the elder meeting the orb, the hand putting
// something down, the energy offered at the temple, the villagers who believe, and what the village and the
// places of power do. Quests begin when their rule says so (all of them but the conversion quest need a
// converted village), pay sparks, show story beats through the story log and tell memory fragments;
// finishing the conversion quest converts the village.

import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { dist2d } from '../core/math/geom';
import { beatPayload } from '../story/story';
import { isFinished, templeOf } from '../world/village/model/buildings';
import { Activity } from '../world/village/model/types';
import { stageOf } from '../world/village/sim/hunger';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import { outpostDoneEvent } from './busEvents';
import {
  CONVERSION_QUEST,
  elderMeets,
  elderOpenToBelief,
  isDusk,
  offeringRate,
} from './content/conversion';
import { FINALE_QUEST } from './content/finale';
import {
  finishedQuestState,
  newQuestState,
  type Objective,
  objectiveOf,
  type QuestContext,
  type QuestEvent,
} from './quest';
import {
  copyQuests,
  type QuestOutcome,
  type QuestsState,
  startQuests,
  stepQuests,
} from './questLog';
import { QUEST_BY_ID, QUESTS } from './registry';

const Q = PHASE0.QUEST;

export interface QuestRuntimeDeps {
  initial?: QuestsState;
  village: Pick<VillageSystemContext, 'sim' | 'notice' | 'convert' | 'setGathering'>;
  /** Where the orb is. */
  orbPlace: () => { x: number; z: number };
  /** The village's day-cycle phase (0.75 sunset). */
  dayPhase: () => number;
  /** The game's phase (the meeting needs 1 or later). */
  gamePhase: () => number;
  energy: { amount: () => number; spend: (amount: number) => void };
  grantSparks: (count: number) => void;
  /** Milestones reached (ids). */
  milestones: () => readonly string[];
  /** The places of power: which are awake, and whether the village has restored every one of the map. */
  places: {
    awake: () => readonly string[];
    allRestored: () => boolean;
  };
  /** Plays the last night's cutscene and calls `done` when it ends (or at once if there is none). */
  playFinale: (done: () => void) => void;
}

export interface QuestRuntime {
  /** Every quest that has begun, by id. */
  state: () => QuestsState;
  /** The objective line of the main quest, or null. */
  objective: () => Objective | null;
  /** The orb has met the elder. */
  elderMet: () => boolean;
  /** Whether this quest has begun and is done. */
  isDone: (id: string) => boolean;
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
  let quests: QuestsState = deps.initial ? copyQuests(deps.initial) : {};
  // The main quest begins with the game.
  if (!quests[CONVERSION_QUEST.id]) quests = { ...quests, [CONVERSION_QUEST.id]: newQuestState() };
  let tickLeft = Q.TICK_S;
  let gatheringOn = false;
  let finalePlaying = false;

  const main = () => quests[CONVERSION_QUEST.id];
  /** The id of the step a quest is on, or undefined before it begins and once it is done. */
  const currentId = (questId: string) => {
    const q = quests[questId];
    return q && !q.done ? QUEST_BY_ID.get(questId)?.steps[q.step]?.id : undefined;
  };
  const temple = () => templeOf(sim.buildings);
  const nearAt = (at: { x: number; z: number }, m: number) => {
    const t = temple();
    return !!t && dist2d(t, at) <= m;
  };
  const near = (m: number) => nearAt(deps.orbPlace(), m);
  // The last night's facts are only worked out while that quest waits for the gathering.
  const finaleWorld = () =>
    currentId(FINALE_QUEST.id) === 'gather'
      ? {
          dusk: isDusk(deps.dayPhase()),
          orbAtTemple: near(Q.FINALE.TEMPLE_M),
          energy: deps.energy.amount(),
          templeShare: sim.gatheredShare(Q.FINALE.TEMPLE_R_M),
        }
      : { dusk: false, orbAtTemple: false, energy: 0, templeShare: 0 };
  const world = (): QuestContext => ({
    converts: sim.believers(),
    elderBelieves: sim.elder >= 0 && v.belief[sim.elder]! >= 1,
    converted: main()?.done ?? false,
    population: v.count,
    milestones: deps.milestones(),
    awake: deps.places.awake(),
    prayersOpen: sim.prayers.open.length,
    hunger: stageOf(sim.hunger, sim.economy.hungry),
    upgradable: sim.buildings.some((b) => isFinished(b) && sim.upgradeCeiling(b.id) > b.level),
    allRestored: deps.places.allRestored(),
    ...finaleWorld(),
  });

  const apply = (outcome: QuestOutcome) => {
    const { effects } = outcome;
    if (effects.sparks > 0) deps.grantSparks(effects.sparks);
    for (const id of effects.beats) {
      const beat = beatPayload(id);
      if (beat) bus.emit('story:beat', beat);
    }
    for (const id of effects.fragments) bus.emit('memory:trigger', { id });
    if (!effects.questDone) return;
    if (outcome.id === CONVERSION_QUEST.id) deps.village.convert();
    bus.emit('quest:done', { id: outcome.id });
  };

  const dispatch = (event: QuestEvent) => {
    const before = quests;
    let ctx = world();
    // A quest that begins on this event can already count it, so they begin first.
    const began = startQuests(QUESTS, quests, ctx);
    quests = began.states;
    // The world is looked at once; a quest that just began (the last night) needs its own facts.
    if (began.started.length > 0) ctx = world();
    const stepped = stepQuests(QUESTS, quests, event, ctx);
    quests = stepped.states;
    for (const o of began.started) apply(o);
    for (const o of stepped.outcomes) apply(o);
    // A quest that has just begun is fed a tick too, so one that is already true completes at once.
    if (began.started.length > 0 && event.type !== 'tick') {
      const again = stepQuests(QUESTS, quests, { type: 'tick' }, world());
      quests = again.states;
      for (const o of again.outcomes) apply(o);
    }
    if (quests !== before && changed(before, quests)) bus.emit('objective:changed', {});
  };

  const offBeliever = bus.on('village:villagerConverted', () => dispatch({ type: 'tick' }));
  const offDeed = bus.on('hand:delivered', ({ what, x, z }) => {
    dispatch({
      type: 'deed',
      what,
      nearTemple: nearAt({ x, z }, Q.FIRE_TEMPLE_M),
      dusk: isDusk(deps.dayPhase()),
    });
  });
  // A conversion that did not come from the quest (a DEV shortcut) ends the quest too.
  const offConverted = bus.on('village:converted', () => {
    const m = main();
    if (m?.done) return;
    quests = { ...quests, [CONVERSION_QUEST.id]: finishedQuestState(CONVERSION_QUEST) };
    dispatch({ type: 'tick' });
  });
  const offs = [
    bus.on('village:plotPlaced', () => dispatch({ type: 'plotPlaced' })),
    bus.on('village:prayer', ({ need, state }) => dispatch({ type: 'prayer', need, state })),
    bus.on('village:heartened', ({ mended, aera }) =>
      dispatch({ type: 'heartened', mended, aera }),
    ),
    bus.on('village:outpost', ({ kind, state }) => {
      const done = state === 'done' ? outpostDoneEvent(kind) : null;
      if (done) dispatch(done);
    }),
    bus.on('village:upgraded', ({ type, level }) =>
      dispatch({ type: 'upgraded', building: type, level }),
    ),
    bus.on('village:hunger', ({ stage }) => dispatch({ type: 'hunger', stage })),
    // The world changed in a way quests read from the context: look again.
    bus.on('milestone:reached', () => dispatch({ type: 'tick' })),
    bus.on('landmark:awakened', () => dispatch({ type: 'tick' })),
    bus.on('landmark:restored', () => dispatch({ type: 'tick' })),
  ];

  const elderInfo = () => {
    const i = sim.elder;
    if (i < 0 || i >= v.count) return null;
    return { x: v.x[i]!, z: v.z[i]!, praying: v.activity[i] === Activity.Pray && !v.indoors[i] };
  };

  return {
    state: () => copyQuests(quests),
    objective: () => {
      const m = main();
      return m ? objectiveOf(CONVERSION_QUEST, m) : null;
    },
    elderMet: () => {
      const m = main();
      return !!m && (m.step > 0 || m.done);
    },
    isDone: (id) => quests[id]?.done ?? false,
    elder: () => sim.elder,
    canBelieve: (villager) => {
      const m = main();
      return villager !== sim.elder || (!!m && elderOpenToBelief(CONVERSION_QUEST, m));
    },
    update: (dt) => {
      const m = main();
      if (m && !m.done && m.step === 0) {
        const orb = deps.orbPlace();
        if (elderMeets({ phase: deps.gamePhase(), elder: elderInfo(), orb })) {
          dispatch({ type: 'elderMet' });
          deps.village.notice(sim.elder, orb.x, orb.z, Q.ELDER_MEET_HOLD_S);
        }
        return;
      }
      if (m && !m.done && currentId(CONVERSION_QUEST.id) === 'offering') {
        const rate = offeringRate({
          active: true,
          progress: m.progress,
          atTemple: near(Q.OFFERING_TEMPLE_M),
          energy: deps.energy.amount(),
        });
        if (rate > 0) {
          const amount = Math.min(rate * dt, Q.OFFERING_GOAL - m.progress);
          deps.energy.spend(amount);
          dispatch({ type: 'offered', amount });
        }
      }
      // The last night: the village gathers while that step waits and stays through the cutscene, which
      // plays once the step comes (also after a load that saved in the middle of it).
      const night = currentId(FINALE_QUEST.id);
      const gather = night === 'gather' || night === 'reveal';
      if (gatheringOn !== gather) {
        gatheringOn = gather;
        deps.village.setGathering(gatheringOn);
      }
      if (night === 'reveal' && !finalePlaying) {
        finalePlaying = true;
        deps.playFinale(() => {
          finalePlaying = false;
          dispatch({ type: 'revealed' });
        });
      }
      tickLeft -= dt;
      if (tickLeft <= 0) {
        tickLeft = Q.TICK_S;
        dispatch({ type: 'tick' });
      }
    },
    dispose: () => {
      offBeliever();
      offDeed();
      offConverted();
      for (const off of offs) off();
      if (gatheringOn) deps.village.setGathering(false);
    },
  };
}

/** Whether a quest began, moved a step or moved a whole unit of progress. */
function changed(before: QuestsState, after: QuestsState): boolean {
  for (const [id, q] of Object.entries(after)) {
    const b = before[id];
    if (!b || b.step !== q.step || Math.floor(b.progress) !== Math.floor(q.progress)) return true;
  }
  return false;
}
