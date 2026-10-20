// scripts/quests/quests-check.ts — headless checks of the quest rules: step order and progress, rewards that
// are given once, story beats, the objective line and journal, the elder's meeting, the offering, and the
// quest state in a save.
//
//   node --experimental-strip-types scripts/quests/quests-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../src/config/phase0.ts';
import {
  elderMeets,
  elderOpenToBelief,
  finishedQuestState,
  isDusk,
  journalOf,
  newQuestState,
  objectiveOf,
  offeringRate,
  parseQuest,
  CONVERSION_QUEST as Q,
  type QuestContext,
  type QuestEvent,
  type QuestState,
  sparksForConvert,
  stepQuest,
} from '../../src/quests/quest.ts';
import { STORY } from '../../src/quests/story.ts';
import { parseProfile } from '../../src/save/profile.ts';
import { check, expectOk, expectRefuses, finish } from '../lib/check.ts';
import { rawProfile } from '../lib/saveFixtures.ts';

const { QUEST } = PHASE0;
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

await check(
  'convert sparks: one for each convert past the goal, none before, and a fixed few at the end',
  () => {
    const after = PHASE0.QUEST.SPARKS_AFTER_CONVERTS;
    assert.equal(sparksForConvert(1), 0);
    assert.equal(sparksForConvert(after), 0);
    assert.equal(sparksForConvert(after + 1), 1);
    assert.equal(sparksForConvert(after + 20), 1);
    assert.ok(PHASE0.QUEST.SPARKS_AT_CONVERSION > 0);
  },
);

await check('the chain has the agreed steps, in order, and the first is the hidden meeting', () => {
  assert.deepEqual(
    Q.steps.map((s) => s.id),
    ['meet', 'convert', 'fire', 'offering', 'believe'],
  );
  assert.equal(Q.steps[0]!.hidden, true);
  assert.equal(Q.steps[1]!.goal, PHASE0.QUEST.CONVERTS_GOAL);
  assert.equal(Q.steps[3]!.goal, PHASE0.QUEST.OFFERING_GOAL);
});

await check(
  'nothing happens before the meeting; the meeting starts the quest and gives a spark and its beat',
  () => {
    const run = runChain();
    run.send({ type: 'signCast', nearTemple: true, dusk: true });
    run.send({ type: 'offered', amount: 40 });
    run.send({ type: 'tick' }, world({ converts: 9, elderBelieves: true }));
    assert.equal(run.state.step, 0, 'still waiting for the elder');
    assert.equal(run.log.sparks, 0);
    const r = run.send({ type: 'elderMet' });
    assert.deepEqual(r.effects.completed, ['meet']);
    assert.equal(r.effects.sparks, 1);
    assert.deepEqual(r.effects.beats, ['elder-meets']);
    assert.equal(run.state.step, 1);
  },
);

await check(
  'converts count towards five from the world, never backwards, and finish the step at five',
  () => {
    const run = runChain();
    run.send({ type: 'elderMet' });
    run.send({ type: 'tick' }, world({ converts: 3 }));
    assert.equal(run.state.progress, 3);
    run.send({ type: 'tick' }, world({ converts: 2 }));
    assert.equal(run.state.progress, 3, 'progress does not go down');
    assert.deepEqual(objectiveOf(Q, run.state), {
      text: 'Help the village believe.',
      value: 3,
      goal: 5,
    });
    run.send({ type: 'tick' }, world({ converts: 5 }));
    assert.equal(run.state.step, 2);
    assert.deepEqual(run.log.beats, ['elder-meets', 'convert-done']);
  },
);

await check('converts made before the step began count at once', () => {
  const run = runChain();
  const r = run.send({ type: 'elderMet' }, world({ converts: 8 }));
  assert.deepEqual(r.effects.completed, ['meet', 'convert'], 'both finish together');
  assert.equal(run.state.step, 2);
});

await check(
  'the temple fire needs a Sign near the temple at dusk: not by day, not far away',
  () => {
    const run = runChain();
    run.send({ type: 'elderMet' }, world({ converts: 5 }));
    assert.equal(Q.steps[run.state.step]!.id, 'fire');
    run.send({ type: 'signCast', nearTemple: true, dusk: false });
    run.send({ type: 'signCast', nearTemple: false, dusk: true });
    assert.equal(run.state.step, 2, 'neither counts');
    const r = run.send({ type: 'signCast', nearTemple: true, dusk: true });
    assert.deepEqual(r.effects.completed, ['fire']);
    assert.equal(r.effects.sparks, 1);
    assert.equal(run.state.step, 3);
  },
);

await check('dusk is the hours around sunset', () => {
  assert.equal(isDusk(0.5), false);
  assert.equal(isDusk(0.7), true);
  assert.equal(isDusk(0.75), true);
  assert.equal(isDusk(0.9), false);
  assert.equal(isDusk(0.1), false);
});

await check(
  'the offering fills to 40 from what is given, in pieces, and gives its spark once',
  () => {
    const run = runChain();
    run.send({ type: 'elderMet' }, world({ converts: 5 }));
    run.send({ type: 'signCast', nearTemple: true, dusk: true });
    for (let i = 0; i < 9; i++) run.send({ type: 'offered', amount: 4 });
    assert.equal(run.state.progress, 36);
    assert.equal(run.state.step, 3);
    const r = run.send({ type: 'offered', amount: 4 });
    assert.deepEqual(r.effects.completed, ['offering']);
    assert.equal(r.effects.sparks, 1);
    run.send({ type: 'offered', amount: 4 });
    assert.equal(run.log.completed.filter((c) => c === 'offering').length, 1, 'once');
  },
);

await check(
  'the last step needs the elder to believe; then the quest is done with its beat',
  () => {
    const run = runChain();
    run.send({ type: 'elderMet' }, world({ converts: 5 }));
    run.send({ type: 'signCast', nearTemple: true, dusk: true });
    run.send({ type: 'offered', amount: 40 });
    assert.equal(Q.steps[run.state.step]!.id, 'believe');
    run.send({ type: 'tick' }, world({ converts: 11 }));
    assert.equal(run.state.done, false);
    const r = run.send({ type: 'tick' }, world({ converts: 11, elderBelieves: true }));
    assert.equal(r.effects.questDone, true);
    assert.equal(run.state.done, true);
    assert.deepEqual(r.effects.beats, ['village-converted']);
    assert.equal(objectiveOf(Q, run.state), null);
  },
);

await check(
  'the whole chain gives three sparks and five beats, each once, whatever order the world repeats itself in',
  () => {
    const run = runChain();
    const everything: [QuestEvent, QuestContext?][] = [
      [{ type: 'signCast', nearTemple: true, dusk: true }],
      [{ type: 'offered', amount: 40 }],
      [{ type: 'elderMet' }],
      [{ type: 'elderMet' }],
      [{ type: 'tick' }, world({ converts: 6 })],
      [{ type: 'signCast', nearTemple: true, dusk: true }],
      [{ type: 'signCast', nearTemple: true, dusk: true }],
      [{ type: 'offered', amount: 40 }],
      [{ type: 'offered', amount: 40 }],
      [{ type: 'tick' }, world({ converts: 11, elderBelieves: true })],
      [{ type: 'tick' }, world({ converts: 11, elderBelieves: true })],
      [{ type: 'elderMet' }],
    ];
    for (const [e, c] of everything) run.send(e, c);
    assert.equal(run.state.done, true);
    assert.equal(run.log.sparks, 3);
    assert.deepEqual(run.log.completed, ['meet', 'convert', 'fire', 'offering', 'believe']);
    assert.deepEqual(run.log.beats, [
      'elder-meets',
      'convert-done',
      'fire-lit',
      'offering-made',
      'village-converted',
    ]);
    const after = feed(run.state, { type: 'elderMet' });
    assert.equal(after.state, run.state, 'a finished quest ignores everything');
    assert.equal(after.effects.sparks, 0);
  },
);

await check('a beat already shown is not shown again (a save carries the list)', () => {
  const seen: QuestState = { step: 0, progress: 0, done: false, beats: ['elder-meets'] };
  const r = feed(seen, { type: 'elderMet' });
  assert.deepEqual(r.effects.beats, []);
  assert.equal(r.effects.sparks, 1, 'but the step still counts');
});

await check('every beat the chain can show has placeholder lines', () => {
  for (const step of Q.steps) {
    const beat = step.reward?.beat;
    if (beat) assert.ok((STORY[beat]?.length ?? 0) > 0, `${beat} has lines`);
  }
});

await check(
  'the objective line and the journal follow the steps, and a hidden step shows once it is done',
  () => {
    let state = newQuestState();
    assert.equal(objectiveOf(Q, state), null, 'no objective before the meeting');
    assert.deepEqual(journalOf(Q, state), []);
    state = feed(state, { type: 'elderMet' }).state;
    assert.equal(objectiveOf(Q, state)!.text, 'Help the village believe.');
    const rows = journalOf(Q, state);
    assert.deepEqual(
      rows.map((r) => [r.text, r.status]),
      [
        ['You met the elder.', 'done'],
        ['Help the village believe.', 'current'],
      ],
    );
    assert.equal(rows[1]!.goal, 5);
    const finished = finishedQuestState(Q);
    assert.equal(journalOf(Q, finished).length, Q.steps.length);
    assert.ok(journalOf(Q, finished).every((r) => r.status === 'done'));
  },
);

await check('the elder can be won over only in the last step (or after the quest)', () => {
  const at = (step: number): QuestState => ({
    step,
    progress: 0,
    done: step === Q.steps.length,
    beats: [],
  });
  for (let s = 0; s < 4; s++) assert.equal(elderOpenToBelief(Q, at(s)), false, `step ${s}`);
  assert.equal(elderOpenToBelief(Q, at(4)), true);
  assert.equal(elderOpenToBelief(Q, at(5)), true);
});

await check(
  'the elder meets the orb when it is within 6 m while he prays, in phase 1 or later',
  () => {
    const base = { phase: 1, elder: { x: 0, z: 0, praying: true }, orb: { x: 5.9, z: 0 } };
    assert.equal(elderMeets(base), true);
    assert.equal(elderMeets({ ...base, orb: { x: 6.1, z: 0 } }), false, 'too far');
    assert.equal(
      elderMeets({ ...base, elder: { x: 0, z: 0, praying: false } }),
      false,
      'not praying',
    );
    assert.equal(elderMeets({ ...base, phase: 0 }), false, 'before the tree');
    assert.equal(elderMeets({ ...base, phase: 2 }), true);
    assert.equal(elderMeets({ ...base, elder: null }), false);
    assert.equal(QUEST.ELDER_MEET_M, 6);
  },
);

await check(
  'the offering flows only at the temple, with 50 energy to begin, 4 a second, then with whatever is left',
  () => {
    const o = { active: true, progress: 0, atTemple: true, energy: 80 };
    assert.equal(offeringRate(o), 4);
    assert.equal(offeringRate({ ...o, energy: 49 }), 0, 'needs 50 to begin');
    assert.equal(offeringRate({ ...o, energy: 50 }), 4);
    assert.equal(offeringRate({ ...o, progress: 12, energy: 10 }), 4, 'once begun it carries on');
    assert.equal(offeringRate({ ...o, progress: 12, energy: 2 }), 2);
    assert.equal(offeringRate({ ...o, progress: 12, energy: 0 }), 0);
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

await check('parseProfile keeps the quest and refuses a profile without a good one', () => {
  const quest = { step: 1, progress: 3, done: false, beats: ['elder-meets'] };
  assert.deepEqual(expectOk(parseProfile(rawProfile({ quest }))).profile.quest, quest);
  assert.equal(parseProfile(rawProfile({ quest: undefined })).ok, false, 'no quest');
  assert.equal(
    parseProfile(rawProfile({ quest: { step: 9, progress: 0, done: true, beats: [] } })).ok,
    false,
  );
});

finish('all quest checks passed');
