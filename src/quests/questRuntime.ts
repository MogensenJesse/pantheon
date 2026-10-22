// src/quests/questRuntime.ts — the quests in the running game
//
// Feeds the pure rules (quest.ts, questLog.ts) from the game: the elder meeting the orb, a Sign being
// cast, the energy offered at the temple, the villagers who believe, and what the village and the
// places of power do. Quests begin when their rule says so (all of them but the conversion quest need a
// converted village), pay sparks, show story beats through the story log and tell memory fragments;
// finishing the conversion quest converts the village.

import { ABILITY_IDS } from '../abilities/abilities';
import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { dist2d } from '../core/math/geom';
import { beatOf } from '../story/story';
import { templeOf } from '../world/village/model/buildings';
import { Activity } from '../world/village/model/types';
import { stageOf } from '../world/village/sim/hunger';
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
import { QUESTS } from './registry';

const Q = PHASE0.QUEST;
const TICK_S = 0.25;

export interface QuestRuntimeDeps {
  initial?: QuestsState;
  village: Pick<VillageSystemContext, 'sim' | 'notice' | 'convert'>;
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
  /** The places of power: which are awake / restored. */
  places: {
    awake: () => readonly string[];
    restored: () => readonly string[];
  };
}

export interface QuestRuntime {
  /** Every quest that has begun, by id. */
  state: () => QuestsState;
  /** The objective line of the main quest, or null. */
  objective: () => Objective | null;
  /** The main quest's steps, for the journal. */
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
  let quests: QuestsState = deps.initial ? copyQuests(deps.initial) : {};
  // The main quest begins with the game.
  if (!quests[CONVERSION_QUEST.id]) quests = { ...quests, [CONVERSION_QUEST.id]: newQuestState() };
  let tickLeft = TICK_S;

  const main = () => quests[CONVERSION_QUEST.id];
  const temple = () => templeOf(sim.buildings);
  const near = (m: number) => {
    const t = temple();
    const orb = deps.orbPlace();
    return !!t && dist2d(t, orb) <= m;
  };
  const world = (): QuestContext => ({
    converts: sim.believers(),
    elderBelieves: sim.elder >= 0 && v.belief[sim.elder]! >= 1,
    converted: main()?.done ?? false,
    population: v.count,
    milestones: deps.milestones(),
    awake: deps.places.awake(),
    restored: deps.places.restored(),
    prayersOpen: sim.prayers.open.length,
    hunger: stageOf(sim.hunger, sim.economy.hungry),
    upgradable: sim.buildings.some((b) => b.stage === 2 && sim.upgradeCeiling(b.id) > b.level),
  });

  const apply = (outcome: QuestOutcome) => {
    const { effects } = outcome;
    if (effects.sparks > 0) deps.grantSparks(effects.sparks);
    for (const id of effects.beats) {
      const beat = beatOf(id);
      if (beat) bus.emit('story:beat', { id, ...beat });
    }
    for (const id of effects.fragments) bus.emit('memory:trigger', { id });
    if (outcome.id === CONVERSION_QUEST.id && effects.questDone) deps.village.convert();
  };

  const dispatch = (event: QuestEvent) => {
    const before = quests;
    // A quest that begins on this event can already count it, so they begin first.
    const began = startQuests(QUESTS, quests, world());
    quests = began.states;
    const stepped = stepQuests(QUESTS, quests, event, world());
    quests = stepped.states;
    for (const o of began.started) apply(o);
    for (const o of stepped.outcomes) apply(o);
    // A quest that has just begun is fed a tick too, so one that is already true completes at once.
    if (began.started.length > 0 && event.type !== 'tick') {
      const again = stepQuests(QUESTS, quests, { type: 'tick' }, world());
      quests = again.states;
      for (const o of again.outcomes) apply(o);
    }
    if (quests !== before && changed(before, quests)) bus.emit('quest:changed', {});
  };

  const currentId = () => {
    const m = main();
    return m ? CONVERSION_QUEST.steps[m.step]?.id : undefined;
  };

  const offBeliever = bus.on('village:villagerConverted', () => dispatch({ type: 'tick' }));
  const offSign = bus.on('ability:cast', ({ id }) => {
    if (id !== ABILITY_IDS.sign) return;
    dispatch({
      type: 'signCast',
      nearTemple: near(Q.FIRE_TEMPLE_M),
      dusk: isDusk(deps.dayPhase()),
    });
  });
  // A conversion that did not come from the quest (a DEV shortcut) ends the quest too.
  const offConverted = bus.on('village:converted', () => {
    const m = main();
    if (m?.done) return;
    quests = {
      ...quests,
      [CONVERSION_QUEST.id]: { ...finishedQuestState(CONVERSION_QUEST), beats: m?.beats ?? [] },
    };
    dispatch({ type: 'tick' });
    bus.emit('quest:changed', {});
  });
  const offs = [
    bus.on('village:plotPlaced', () => dispatch({ type: 'plotPlaced' })),
    bus.on('village:prayer', ({ need, state }) => dispatch({ type: 'prayer', need, state })),
    bus.on('village:heartened', ({ villager, mended, aera }) =>
      dispatch({ type: 'heartened', villager, mended, aera }),
    ),
    bus.on('village:outpost', ({ kind, state }) => {
      if (state === 'done') dispatch({ type: 'outpostDone', kind });
    }),
    bus.on('village:upgraded', ({ type, level }) =>
      dispatch({ type: 'upgraded', building: type, level }),
    ),
    bus.on('milestone:reached', ({ id }) => dispatch({ type: 'milestone', id })),
    bus.on('village:hunger', ({ stage }) => dispatch({ type: 'hunger', stage })),
    bus.on('landmark:awakened', ({ kind }) => dispatch({ type: 'awakened', kind })),
    bus.on('landmark:restored', ({ kind }) => dispatch({ type: 'restored', kind })),
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
    journal: () => {
      const m = main();
      return m ? journalOf(CONVERSION_QUEST, m) : [];
    },
    elderMet: () => {
      const m = main();
      return !!m && (m.step > 0 || m.done);
    },
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
      if (m && !m.done && currentId() === 'offering') {
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
      for (const off of offs) off();
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
