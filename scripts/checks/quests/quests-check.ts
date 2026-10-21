// scripts/checks/quests/quests-check.ts — headless checks of the quest rules: step progress, rewards given once, the elder's meeting, the offering, the save parser.
//
//   node --experimental-strip-types scripts/checks/quests/quests-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import {
  elderMeets,
  elderOpenToBelief,
  finishedQuestState,
  newQuestState,
  offeringRate,
  parseQuest,
  CONVERSION_QUEST as Q,
  type QuestContext,
  type QuestEvent,
  type QuestState,
  sparksForConvert,
  stepQuest,
} from '../../../src/quests/quest.ts';
import { check, expectOk, expectRefuses, finish } from '../lib/check.ts';

const { QUEST } = PHASE0;
const CONVERTS = QUEST.CONVERTS_GOAL;
const OFFERING = QUEST.OFFERING_GOAL;
const stepIndex = (id: string) => Q.steps.findIndex((st) => st.id === id);
const world = (over: Partial<QuestContext> = {}): QuestContext => ({
  converts: 0,
  elderBelieves: false,
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

finish('all quest checks passed');
