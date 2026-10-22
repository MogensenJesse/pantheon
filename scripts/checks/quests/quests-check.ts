// scripts/checks/quests/quests-check.ts — headless checks of the quest rules: step progress, rewards given once, the elder's meeting, the offering, the save parser.
//
//   node --experimental-strip-types scripts/checks/quests/quests-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import {
  awaken,
  finishRestoration,
  initialLandmarks,
  startRestoration,
} from '../../../src/landmarks/landmarks.ts';
import { memoryBookOf } from '../../../src/quests/memoryBook.ts';
import {
  elderMeets,
  elderOpenToBelief,
  finishedQuestState,
  newQuestState,
  offeringRate,
  parseQuest,
  CONVERSION_QUEST as Q,
  type QuestContext,
  type QuestDef,
  type QuestEvent,
  type QuestState,
  sparksForConvert,
  stepQuest,
} from '../../../src/quests/quest.ts';
import {
  copyQuests,
  finishedQuests,
  parseQuests,
  type QuestsState,
  startQuests,
  stepQuests,
} from '../../../src/quests/questLog.ts';
import { QUESTS } from '../../../src/quests/registry.ts';
import { MEMORY_FRAGMENTS } from '../../../src/story/fragments.ts';
import { beatOf, SPEAKER_NAMES, SPEECH } from '../../../src/story/story.ts';
import { check, expectOk, expectRefuses, finish } from '../lib/check.ts';

const { QUEST } = PHASE0;
const CONVERTS = QUEST.CONVERTS_GOAL;
const OFFERING = QUEST.OFFERING_GOAL;
const stepIndex = (id: string) => Q.steps.findIndex((st) => st.id === id);
const world = (over: Partial<QuestContext> = {}): QuestContext => ({
  converts: 0,
  elderBelieves: false,
  converted: false,
  population: 10,
  milestones: [],
  awake: [],
  restored: [],
  prayersOpen: 0,
  hunger: 'fed',
  upgradable: false,
  allRestored: false,
  dusk: false,
  orbAtTemple: false,
  energy: 0,
  templeShare: 0,
  ...over,
});
const feed = (state: QuestState, event: QuestEvent, ctx: QuestContext = world()) =>
  stepQuest(Q, state, event, ctx);

/** A run of the whole chain, collecting what was given. */
function runChain() {
  let state = newQuestState();
  const log = { sparks: 0, beats: [] as string[], completed: [] as string[] };
  const send = (event: QuestEvent, ctx?: QuestContext) => {
    const r = feed(state, event, ctx);
    state = r.state;
    log.sparks += r.effects.sparks;
    log.beats.push(...r.effects.beats);
    log.completed.push(...r.effects.completed);
    return r;
  };
  return {
    send,
    log,
    get state() {
      return state;
    },
  };
}

await check('convert sparks: one for each convert past the goal, none before', () => {
  const after = QUEST.SPARKS_AFTER_CONVERTS;
  assert.equal(sparksForConvert(after), 0);
  assert.equal(sparksForConvert(after + 1), 1);
  assert.equal(sparksForConvert(after + 20), 1);
});

await check(
  'nothing happens before the meeting; the meeting starts the quest and gives a spark and its beat',
  () => {
    const run = runChain();
    run.send({ type: 'signCast', nearTemple: true, dusk: true });
    run.send({ type: 'offered', amount: OFFERING });
    run.send({ type: 'tick' }, world({ converts: 99, elderBelieves: true }));
    assert.equal(run.state.step, 0, 'still waiting for the elder');
    assert.equal(run.log.sparks, 0);
    const r = run.send({ type: 'elderMet' });
    assert.deepEqual(r.effects.completed, ['meet']);
    assert.equal(r.effects.beats.length, 1);
    assert.equal(run.state.step, 1);
  },
);

await check(
  'converts count from the world, never backwards, and finish the step at the goal',
  () => {
    const run = runChain();
    run.send({ type: 'elderMet' });
    run.send({ type: 'tick' }, world({ converts: CONVERTS - 2 }));
    assert.equal(run.state.progress, CONVERTS - 2);
    run.send({ type: 'tick' }, world({ converts: 1 }));
    assert.equal(run.state.progress, CONVERTS - 2, 'progress does not go down');
    run.send({ type: 'tick' }, world({ converts: CONVERTS }));
    assert.equal(run.state.step, stepIndex('fire'));
  },
);

await check('converts made before the step began count at once', () => {
  const run = runChain();
  const r = run.send({ type: 'elderMet' }, world({ converts: CONVERTS + 3 }));
  assert.deepEqual(r.effects.completed, ['meet', 'convert'], 'both finish together');
  assert.equal(run.state.step, 2);
});

await check(
  'the temple fire needs a Sign near the temple at dusk: not by day, not far away',
  () => {
    const run = runChain();
    run.send({ type: 'elderMet' }, world({ converts: CONVERTS }));
    assert.equal(run.state.step, stepIndex('fire'));
    run.send({ type: 'signCast', nearTemple: true, dusk: false });
    run.send({ type: 'signCast', nearTemple: false, dusk: true });
    assert.equal(run.state.step, 2, 'neither counts');
    const r = run.send({ type: 'signCast', nearTemple: true, dusk: true });
    assert.deepEqual(r.effects.completed, ['fire']);
    assert.equal(run.state.step, stepIndex('offering'));
  },
);

await check('the offering fills from what is given, in pieces, and gives its spark once', () => {
  const run = runChain();
  run.send({ type: 'elderMet' }, world({ converts: CONVERTS }));
  run.send({ type: 'signCast', nearTemple: true, dusk: true });
  const piece = OFFERING / 10;
  for (let i = 0; i < 9; i++) run.send({ type: 'offered', amount: piece });
  assert.equal(run.state.step, stepIndex('offering'));
  const sparks = run.log.sparks;
  const r = run.send({ type: 'offered', amount: piece });
  assert.deepEqual(r.effects.completed, ['offering']);
  assert.equal(run.log.sparks, sparks + 1);
  run.send({ type: 'offered', amount: piece });
  assert.equal(run.log.completed.filter((c) => c === 'offering').length, 1, 'once');
});

await check(
  'the last step needs the elder to believe; then the quest is done with its beat',
  () => {
    const run = runChain();
    run.send({ type: 'elderMet' }, world({ converts: CONVERTS }));
    run.send({ type: 'signCast', nearTemple: true, dusk: true });
    run.send({ type: 'offered', amount: OFFERING });
    assert.equal(run.state.step, stepIndex('believe'));
    run.send({ type: 'tick' }, world({ converts: 11 }));
    assert.equal(run.state.done, false);
    const r = run.send({ type: 'tick' }, world({ converts: 11, elderBelieves: true }));
    assert.equal(r.effects.questDone, true);
    assert.equal(run.state.done, true);
  },
);

await check(
  'the whole chain pays its rewards once each, whatever order the world repeats itself in',
  () => {
    const run = runChain();
    const everything: [QuestEvent, QuestContext?][] = [
      [{ type: 'signCast', nearTemple: true, dusk: true }],
      [{ type: 'offered', amount: OFFERING }],
      [{ type: 'elderMet' }],
      [{ type: 'elderMet' }],
      [{ type: 'tick' }, world({ converts: CONVERTS + 1 })],
      [{ type: 'signCast', nearTemple: true, dusk: true }],
      [{ type: 'signCast', nearTemple: true, dusk: true }],
      [{ type: 'offered', amount: OFFERING }],
      [{ type: 'offered', amount: OFFERING }],
      [{ type: 'tick' }, world({ converts: 11, elderBelieves: true })],
      [{ type: 'tick' }, world({ converts: 11, elderBelieves: true })],
      [{ type: 'elderMet' }],
    ];
    for (const [e, c] of everything) run.send(e, c);
    assert.equal(run.state.done, true);
    assert.equal(
      run.log.sparks,
      Q.steps.reduce((n, st) => n + (st.reward?.sparks ?? 0), 0),
    );
    assert.deepEqual(
      run.log.completed,
      Q.steps.map((st) => st.id),
    );
    assert.deepEqual(
      run.log.beats,
      Q.steps.flatMap((st) => st.reward?.beat ?? []),
    );
    const after = feed(run.state, { type: 'elderMet' });
    assert.equal(after.state, run.state, 'a finished quest ignores everything');
    assert.equal(after.effects.sparks, 0);
  },
);

await check('a beat already shown is not shown again (a save carries the list)', () => {
  const seen: QuestState = { step: 0, progress: 0, done: false, beats: ['elder-meets'] };
  const r = feed(seen, { type: 'elderMet' });
  assert.deepEqual(r.effects.beats, []);
  assert.ok(r.effects.sparks > 0, 'but the step still counts');
});

await check('the elder can be won over only in the last step (or after the quest)', () => {
  const at = (step: number): QuestState => ({
    step,
    progress: 0,
    done: step === Q.steps.length,
    beats: [],
  });
  const last = stepIndex('believe');
  for (let s = 0; s < last; s++) assert.equal(elderOpenToBelief(Q, at(s)), false, `step ${s}`);
  assert.equal(elderOpenToBelief(Q, at(last)), true);
  assert.equal(elderOpenToBelief(Q, at(Q.steps.length)), true);
});

await check('the elder meets the orb only in reach while he prays, in phase 1 or later', () => {
  const m = QUEST.ELDER_MEET_M;
  const base = { phase: 1, elder: { x: 0, z: 0, praying: true }, orb: { x: m - 0.1, z: 0 } };
  assert.equal(elderMeets(base), true);
  assert.equal(elderMeets({ ...base, orb: { x: m + 0.1, z: 0 } }), false, 'too far');
  assert.equal(
    elderMeets({ ...base, elder: { x: 0, z: 0, praying: false } }),
    false,
    'not praying',
  );
  assert.equal(elderMeets({ ...base, phase: 0 }), false, 'before the tree');
  assert.equal(elderMeets({ ...base, elder: null }), false);
});

await check(
  'the offering flows only at the temple: a full measure to begin, then whatever is left',
  () => {
    const rate = QUEST.OFFERING_PER_SEC;
    const min = QUEST.OFFERING_MIN_ENERGY;
    const o = { active: true, progress: 0, atTemple: true, energy: min + 30 };
    assert.equal(offeringRate(o), rate);
    assert.equal(offeringRate({ ...o, energy: min - 1 }), 0, 'needs a full measure to begin');
    assert.equal(
      offeringRate({ ...o, progress: 1, energy: rate + 1 }),
      rate,
      'once begun it carries on',
    );
    assert.equal(offeringRate({ ...o, progress: 1, energy: rate / 2 }), rate / 2);
    assert.equal(offeringRate({ ...o, progress: 1, energy: 0 }), 0);
    assert.equal(offeringRate({ ...o, atTemple: false }), 0);
    assert.equal(offeringRate({ ...o, active: false }), 0);
  },
);

// ---- the save ----

await check('parseQuest accepts a good state and refuses damaged ones', () => {
  const good = { step: 2, progress: 0, done: false, beats: ['elder-meets'] };
  assert.deepEqual(expectOk(parseQuest(good)).quest, good);
  expectOk(parseQuest(newQuestState()));
  expectOk(parseQuest(finishedQuestState(Q)));
  const bad: [string, unknown][] = [
    ['not a record', 5],
    ['step missing', { progress: 0, done: false, beats: [] }],
    ['step too high', { step: 9, progress: 0, done: true, beats: [] }],
    ['fractional step', { step: 1.5, progress: 0, done: false, beats: [] }],
    ['negative progress', { step: 1, progress: -1, done: false, beats: [] }],
    ['progress past the goal', { step: 1, progress: 6, done: false, beats: [] }],
    ['done but not at the end', { step: 2, progress: 0, done: true, beats: [] }],
    ['at the end but not done', { step: 5, progress: 0, done: false, beats: [] }],
    ['beats not strings', { step: 1, progress: 0, done: false, beats: [1] }],
    ['no beats', { step: 1, progress: 0, done: false }],
  ];
  expectRefuses(parseQuest, bad);
});

// ---- several quests at once ----

const ROOF: QuestDef = {
  id: 'roof',
  title: 'First roof',
  kind: 'teaching',
  intro: 'roof-intro',
  steps: [
    {
      id: 'plot',
      text: 'Mark a plot.',
      advance: (p, e) => (e.type === 'plotPlaced' ? 1 : p),
      reward: { sparks: 1, beat: 'roof-done' },
    },
  ],
};
const FAVOUR: QuestDef = {
  id: 'favour',
  title: 'A favour',
  kind: 'favour',
  available: (ctx) => ctx.converted && ctx.awake.includes('tree'),
  steps: [
    {
      id: 'raise',
      text: '',
      advance: (p, _e, ctx) => (ctx.milestones.includes('level_2') ? 1 : p),
      reward: { sparks: 2, fragment: 18 },
    },
  ],
};
const DEFS = [Q, ROOF, FAVOUR];

await check('the registry holds the conversion quest and unique ids', () => {
  assert.ok(QUESTS.includes(Q));
  assert.equal(new Set(QUESTS.map((d) => d.id)).size, QUESTS.length);
});

await check('quests begin when their rule is true, once, with their intro', () => {
  const none: QuestsState = {};
  const first = startQuests(DEFS, none, world());
  assert.deepEqual(Object.keys(first.states), ['conversion']);
  const converted = startQuests(DEFS, first.states, world({ converted: true }));
  assert.deepEqual(Object.keys(converted.states).sort(), ['conversion', 'roof']);
  assert.deepEqual(
    converted.started.map((o) => o.id),
    ['roof'],
  );
  assert.deepEqual(converted.started[0]?.effects.beats, ['roof-intro']);
  // The favour waits for its place to wake.
  const woken = startQuests(DEFS, converted.states, world({ converted: true, awake: ['tree'] }));
  assert.deepEqual(
    woken.started.map((o) => o.id),
    ['favour'],
  );
  // Nothing begins twice, and an unchanged log is the same object.
  const again = startQuests(DEFS, woken.states, world({ converted: true, awake: ['tree'] }));
  assert.equal(again.states, woken.states);
  assert.equal(again.started.length, 0);
});

await check('quests step on their own: an event moves only the quests it concerns', () => {
  const ctx = world({ converted: true, awake: ['tree'] });
  const begun = startQuests(DEFS, {}, ctx).states;
  const r = stepQuests(DEFS, begun, { type: 'plotPlaced' }, ctx);
  assert.deepEqual(
    r.outcomes.map((o) => o.id),
    ['roof'],
  );
  assert.equal(r.outcomes[0]?.effects.sparks, 1);
  assert.equal(r.states.roof?.done, true);
  assert.equal(r.states.favour?.done, false);
  // A finished quest pays nothing more, and nothing moving keeps the same log.
  const after = stepQuests(DEFS, r.states, { type: 'plotPlaced' }, ctx);
  assert.equal(after.outcomes.length, 0);
  assert.equal(after.states, r.states);
});

await check('a fragment and sparks come with the step that earns them, once', () => {
  const ctx = world({ converted: true, awake: ['tree'], milestones: ['level_2'] });
  const begun = startQuests(DEFS, {}, ctx).states;
  const r = stepQuests(DEFS, begun, { type: 'tick' }, ctx);
  const favour = r.outcomes.find((o) => o.id === 'favour');
  assert.equal(favour?.effects.sparks, 2);
  assert.deepEqual(favour?.effects.fragments, [18]);
  const again = stepQuests(DEFS, r.states, { type: 'tick' }, ctx);
  assert.equal(again.outcomes.length, 0);
  assert.deepEqual(finishedQuests(r.states), ['favour']);
});

await check('parseQuests keeps known quests, drops unknown ones, refuses damage', () => {
  const ctx = world({ converted: true });
  const log = startQuests(DEFS, {}, ctx).states;
  const copy = copyQuests(log);
  assert.notEqual(copy.roof, log.roof);
  assert.deepEqual(expectOk(parseQuests(JSON.parse(JSON.stringify(log)), DEFS)).quests, log);
  const withStranger = { ...log, ghost: newQuestState() };
  assert.deepEqual(Object.keys(expectOk(parseQuests(withStranger, DEFS)).quests).sort(), [
    'conversion',
    'roof',
  ]);
  expectOk(parseQuests({}, DEFS));
  expectRefuses(
    (raw) => parseQuests(raw, DEFS),
    [
      ['not a record', 5],
      ['an array', []],
      ['a damaged quest', { roof: { step: 9, progress: 0, done: true, beats: [] } }],
      ['a quest that is not a record', { roof: 3 }],
    ],
  );
});

// ---- who speaks ----

await check('every beat a quest uses has lines, and a spoken beat names a known speaker', () => {
  for (const def of QUESTS) {
    const ids = [def.intro, ...def.steps.map((st) => st.reward?.beat)].filter(
      (id): id is string => !!id,
    );
    for (const id of ids) {
      const beat = beatOf(id);
      assert.ok(beat && beat.lines.length > 0, `${def.id}: beat "${id}" has no lines`);
    }
  }
  for (const [id, speech] of Object.entries(SPEECH)) {
    assert.ok(speech.speaker in SPEAKER_NAMES, `${id}: unknown speaker`);
    assert.ok(speech.lines.length > 0, `${id}: no lines`);
  }
  assert.equal(beatOf('no-such-beat'), null);
  assert.equal(beatOf('elder-meets')?.speaker, undefined, 'narrator lines have no speaker');
});

// ---- the memory book ----

await check(
  'the memory book keeps memories, woken places and milestones, and a rune that fills',
  () => {
    const places = [
      { kind: 'tree' as const, x: 0, z: 0 },
      { kind: 'monolith' as const, x: 5, z: 5 },
    ];
    const woken = awaken(awaken(initialLandmarks(), 'tree'), 'monolith');
    const view = (landmarks: ReturnType<typeof initialLandmarks>, nameReturned = false) =>
      memoryBookOf({
        fragments: [16, 1, 1, 99, 17],
        places,
        landmarks,
        milestones: ['first_place'],
        nameReturned,
      });
    const fresh = view(woken);
    assert.deepEqual(
      fresh.memories.map((m) => m.id),
      [1, 16, 17],
      'sorted, once each, unknown ones left out',
    );
    assert.equal(fresh.memories[0]?.text, MEMORY_FRAGMENTS[1]);
    assert.deepEqual(
      fresh.places.map((p) => [p.kind, p.status]),
      [
        ['tree', 'awake'],
        ['monolith', 'awake'],
      ],
    );
    assert.deepEqual(fresh.milestones, ['Restore a place of power']);
    assert.equal(fresh.rune.length, 5, 'a stroke for each kind of place');
    assert.equal(fresh.rune.filter((s) => s.lit).length, 0);
    const going = view(startRestoration(woken, 'tree'));
    assert.equal(going.places[0]?.status, 'restoring');
    const done = view(finishRestoration(startRestoration(woken, 'tree'), 'tree'));
    assert.equal(done.places[0]?.status, 'restored');
    assert.ok(done.places[0]?.restoredCaption);
    assert.deepEqual(
      done.rune.filter((s) => s.lit).map((s) => s.kind),
      ['tree'],
    );
    assert.equal(
      view(woken, true).rune.every((s) => s.lit),
      true,
      'whole once the name returns',
    );
    // Nothing remembered yet: an empty book, not a broken one.
    const empty = memoryBookOf({
      fragments: [],
      places,
      landmarks: initialLandmarks(),
      milestones: [],
      nameReturned: false,
    });
    assert.deepEqual([empty.memories, empty.places, empty.milestones], [[], [], []]);
    // A place this map lacks is left out even if the save says it is awake.
    assert.equal(
      memoryBookOf({
        fragments: [],
        places: [places[0]!],
        landmarks: woken,
        milestones: [],
        nameReturned: false,
      }).places.length,
      1,
    );
  },
);

finish('all quest checks passed');
