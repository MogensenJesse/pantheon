// scripts/checks/quests/quest-content-check.ts — headless checks of the quests that ship: the eight teaching
// quests, Caros's five favours and the last night begin when they should, finish on their own event, pay once
// and say what they say (every story beat has lines and is used). The cutscene's timeline is in
// `scripts/checks/finale/`.
//
//   node --experimental-strip-types scripts/checks/quests/quest-content-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import type { LandmarkKind } from '../../../src/map/MapTypes.ts';
import { FAVOUR_QUESTS } from '../../../src/quests/content/favours.ts';
import { FINALE_QUEST } from '../../../src/quests/content/finale.ts';
import { TEACHING_QUESTS } from '../../../src/quests/content/teaching.ts';
import { objectiveOf, type QuestContext, type QuestEvent } from '../../../src/quests/quest.ts';
import { type QuestsState, startQuests, stepQuests } from '../../../src/quests/questLog.ts';
import { QUESTS } from '../../../src/quests/registry.ts';
import { FRAGMENT_IDS, MEMORY_FRAGMENTS } from '../../../src/story/fragments.ts';
import { BEATS, beatPayload, SPEAKER_NAMES } from '../../../src/story/story.ts';
import { check, finish } from '../lib/check.ts';
import { convertedWorld as world } from '../lib/questFixtures.ts';

const MAX_TEACHING_OPEN = PHASE0.QUEST.MAX_TEACHING_OPEN;
const quest = (id: string) => {
  const def = QUESTS.find((d) => d.id === id);
  assert.ok(def, `quest ${id} is registered`);
  return def;
};

/** Begins `id` in `ctx`, then feeds it the events and returns what the quest did, in order. */
function run(id: string, ctx: QuestContext, events: QuestEvent[], after?: Partial<QuestContext>) {
  const defs = [quest(id)];
  const begun = startQuests(defs, {}, ctx);
  assert.ok(begun.states[id], `${id} begins`);
  let states: QuestsState = begun.states;
  let sparks = 0;
  const fragments: number[] = [];
  const beats: string[] = [];
  for (const event of events) {
    const r = stepQuests(defs, states, event, { ...ctx, ...after });
    states = r.states;
    for (const o of r.outcomes) {
      sparks += o.effects.sparks;
      fragments.push(...o.effects.fragments);
      beats.push(...o.effects.beats);
    }
  }
  return { state: states[id], sparks, fragments, beats };
}

const begins = (id: string, ctx: QuestContext) =>
  Boolean(startQuests([quest(id)], {}, ctx).states[id]);

await check('teaching quests begin only when the mechanic is open', () => {
  assert.equal(begins('first-roof', world()), false);
  assert.equal(begins('first-roof', world({ milestones: ['homes_10'] })), true);
  assert.equal(begins('prayer-heard', world()), false);
  assert.equal(begins('prayer-heard', world({ prayersOpen: 1 })), true);
  assert.equal(begins('the-touch', world({ milestones: ['homes_10'] })), false);
  assert.equal(begins('the-touch', world({ milestones: ['prayers_5'] })), true);
  assert.equal(begins('raised', world()), false);
  assert.equal(begins('raised', world({ upgradable: true })), true);
  assert.equal(begins('first-place', world()), false);
  assert.equal(begins('first-place', world({ awake: ['tree'] })), true);
  assert.equal(begins('beyond-fence', world()), false);
  assert.equal(begins('beyond-fence', world({ milestones: ['first_place'] })), true);
  assert.equal(begins('hard-winter', world()), false);
  assert.equal(begins('hard-winter', world({ hunger: 'empty' })), true);
  assert.equal(begins('many-hands', world({ population: 14 })), false);
  assert.equal(begins('many-hands', world({ population: 15 })), true);
  // Nothing begins in a village that has not converted.
  for (const def of TEACHING_QUESTS) {
    const ctx = world({
      converted: false,
      milestones: ['homes_10', 'prayers_5', 'first_place'],
      awake: ['tree'],
      prayersOpen: 2,
      upgradable: true,
      hunger: 'weak',
      population: 30,
    });
    assert.equal(begins(def.id, ctx), false, `${def.id} waits for the conversion`);
  }
});

await check('teaching quests finish on their own event, pay a spark and a line, once', () => {
  const cases: [string, Partial<QuestContext>, QuestEvent[], Partial<QuestContext>?][] = [
    ['first-roof', { milestones: ['homes_10'] }, [{ type: 'plotPlaced' }]],
    [
      'prayer-heard',
      { prayersOpen: 1 },
      [
        { type: 'prayer', need: 'food', state: 'lapsed' },
        { type: 'prayer', need: 'food', state: 'answered' },
      ],
    ],
    [
      'the-touch',
      { milestones: ['prayers_5'] },
      [
        { type: 'heartened', mended: false, aera: false },
        { type: 'heartened', mended: true, aera: false },
      ],
    ],
    // These two read the milestones from the world, which have changed by the time the event comes.
    ['raised', { upgradable: true }, [{ type: 'tick' }], { milestones: ['level_2'] }],
    ['first-place', { awake: ['tree'] }, [{ type: 'tick' }], { milestones: ['first_place'] }],
    ['beyond-fence', { milestones: ['first_place'] }, [{ type: 'outpostDone', kind: 'lumber' }]],
    [
      'hard-winter',
      { hunger: 'weak' },
      [
        { type: 'hunger', stage: 'weak' },
        { type: 'hunger', stage: 'recovered' },
      ],
    ],
    ['many-hands', { population: 15 }, [{ type: 'tick' }], { milestones: ['folk_20'] }],
  ];
  assert.equal(cases.length, TEACHING_QUESTS.length, 'a case for every teaching quest');
  for (const [id, ctx, events, after] of cases) {
    const r = run(id, world(ctx), [...events, ...events], after);
    assert.equal(r.state?.done, true, `${id} is done`);
    assert.equal(r.sparks, 1, `${id} pays one spark`);
    assert.equal(r.beats.length, 1, `${id} says one closing line`);
  }
});

await check('a quest that is not about the event does not move', () => {
  const r = run('first-roof', world({ milestones: ['homes_10'] }), [
    { type: 'prayer', need: 'food', state: 'answered' },
    { type: 'outpostDone', kind: 'lumber' },
    { type: 'tick' },
  ]);
  assert.equal(r.state?.done, false);
  assert.equal(r.sparks, 0);
});

await check('teaching quests begin one at a time and never more than the limit', () => {
  const everything = world({
    milestones: ['homes_10', 'prayers_5', 'first_place', 'level_2'],
    awake: ['tree'],
    prayersOpen: 1,
    upgradable: true,
    hunger: 'empty',
    population: 20,
  });
  let states: QuestsState = {};
  const order: string[] = [];
  for (let round = 0; round < 12; round++) {
    const r = startQuests(TEACHING_QUESTS, states, everything);
    const teaching = r.started.map((o) => o.id);
    assert.ok(teaching.length <= 1, 'at most one begins per look');
    order.push(...teaching);
    states = r.states;
  }
  assert.equal(order.length, MAX_TEACHING_OPEN, 'the rest wait while the limit is open');
  assert.deepEqual(
    order,
    TEACHING_QUESTS.slice(0, MAX_TEACHING_OPEN).map((d) => d.id),
  );
  // One finishes, the next may begin.
  const [first] = order;
  const done = { ...states, [first as string]: { ...states[first as string]!, done: true } };
  const next = startQuests(TEACHING_QUESTS, done, everything);
  assert.equal(next.started.length, 1);
});

await check('each favour begins when its place is awake, and not before', () => {
  for (const def of FAVOUR_QUESTS) {
    const kind = def.id.replace('favour-', '');
    assert.equal(begins(def.id, world()), false, `${def.id} waits for its place`);
    assert.equal(
      begins(def.id, world({ awake: Object.keys(FRAGMENT_IDS.favour).filter((k) => k !== kind) })),
      false,
      'another place waking does not call it',
    );
    assert.equal(begins(def.id, world({ awake: [kind], converted: false })), false);
    assert.equal(begins(def.id, world({ awake: [kind] })), true, `${def.id} begins`);
  }
});

await check('the favours finish by their rule and tell their fragment once', () => {
  const pray = (need: 'food' | 'rain' | 'shelter'): QuestEvent => ({
    type: 'prayer',
    need,
    state: 'answered',
  });
  const cases: [LandmarkKind, QuestEvent[], QuestEvent[]][] = [
    ['runestones', [pray('food'), pray('rain')], [pray('shelter')]],
    ['tree', [pray('food'), pray('shelter')], [pray('rain')]],
    [
      'temple_ruin',
      [
        { type: 'upgraded', building: 'granary', level: 2 },
        { type: 'upgraded', building: 'house_a', level: 1 },
      ],
      [{ type: 'upgraded', building: 'house_b', level: 2 }],
    ],
    [
      'sunken_ruin',
      [{ type: 'outpostDone', kind: 'lumber' }],
      [{ type: 'outpostDone', kind: 'fishing' }],
    ],
    [
      'monolith',
      [{ type: 'heartened', mended: true, aera: false }],
      [{ type: 'heartened', mended: false, aera: true }],
    ],
  ];
  assert.equal(cases.length, FAVOUR_QUESTS.length);
  for (const [kind, notEnough, finishing] of cases) {
    const id = `favour-${kind}`;
    const ctx = world({ awake: [kind] });
    const early = run(id, ctx, notEnough);
    assert.equal(early.state?.done, false, `${id}: not yet`);
    assert.equal(early.sparks, 0);
    const done = run(id, ctx, [...notEnough, ...finishing, ...finishing]);
    assert.equal(done.state?.done, true, `${id}: done`);
    assert.equal(done.sparks, 1, `${id}: one spark`);
    assert.deepEqual(done.fragments, [FRAGMENT_IDS.favour[kind]]);
  }
});

await check('the three-prayer favour counts only answered prayers', () => {
  const ctx = world({ awake: ['runestones'] });
  const answered: QuestEvent = { type: 'prayer', need: 'food', state: 'answered' };
  const opened: QuestEvent = { type: 'prayer', need: 'food', state: 'opened' };
  const r = run('favour-runestones', ctx, [opened, answered, opened, answered]);
  assert.equal(r.state?.done, false);
  assert.equal(r.state?.progress, 2);
  const done = run('favour-runestones', ctx, [answered, answered, answered]);
  assert.equal(done.state?.done, true);
});

await check('every favour fragment has its text', () => {
  for (const [kind, id] of Object.entries(FRAGMENT_IDS.favour)) {
    assert.ok(MEMORY_FRAGMENTS[id], `${kind}: fragment ${id}`);
  }
  assert.equal(new Set(Object.values(FRAGMENT_IDS.favour)).size, FAVOUR_QUESTS.length);
});

// ---- who speaks ----

await check('the story table: every beat a quest uses has lines and every beat is used', () => {
  const used = new Set<string>();
  for (const def of QUESTS) {
    const ids = [def.intro, ...def.steps.map((st) => st.reward?.beat)].filter(
      (id): id is string => !!id,
    );
    for (const id of ids) {
      used.add(id);
      const payload = beatPayload(id);
      assert.ok(payload && payload.lines.length > 0, `${def.id}: beat "${id}" has no lines`);
    }
  }
  const unused = Object.keys(BEATS).filter((id) => !used.has(id));
  assert.deepEqual(unused, [], 'a beat no quest uses is dead text');
});

await check('a spoken beat names a known speaker and carries the name; narration has none', () => {
  for (const [id, beat] of Object.entries(BEATS)) {
    assert.ok(beat.lines.length > 0, `${id}: no lines`);
    if (beat.speaker) {
      assert.ok(beat.speaker in SPEAKER_NAMES, `${id}: unknown speaker`);
      assert.equal(beatPayload(id)?.speaker, SPEAKER_NAMES[beat.speaker]);
    } else {
      assert.equal(beatPayload(id)?.speaker, undefined, `${id}: narrator lines have no speaker`);
    }
  }
  assert.equal(beatPayload('no-such-beat'), null);
  // Every speaker is heard at least once.
  for (const speaker of Object.keys(SPEAKER_NAMES)) {
    assert.ok(
      Object.values(BEATS).some((b) => b.speaker === speaker),
      `${speaker} never speaks`,
    );
  }
});

// ---- the last night ----

const F = PHASE0.QUEST.FINALE;
const night = (over: Partial<QuestContext> = {}) =>
  world({
    allRestored: true,
    dusk: true,
    orbAtTemple: true,
    energy: F.MIN_ENERGY,
    templeShare: F.GATHER_SHARE,
    ...over,
  });

await check('the last night is called only when every place is restored', () => {
  assert.equal(begins(FINALE_QUEST.id, world()), false);
  assert.equal(begins(FINALE_QUEST.id, world({ awake: ['tree'], allRestored: false })), false);
  assert.equal(begins(FINALE_QUEST.id, night({ converted: false })), false);
  const r = startQuests([FINALE_QUEST], {}, night());
  assert.deepEqual(r.started[0]?.effects.beats, ['finale-call'], 'the elder calls the village');
});

await check(
  'the gathering needs dusk, the orb at the temple with energy, and enough of the village',
  () => {
    const defs = [FINALE_QUEST];
    const begun = startQuests(defs, {}, night({ dusk: false })).states;
    const tries: [string, Partial<QuestContext>][] = [
      ['by day', { dusk: false }],
      ['with the orb away', { orbAtTemple: false }],
      ['without energy', { energy: F.MIN_ENERGY - 1 }],
      ['with too few gathered', { templeShare: F.GATHER_SHARE - 0.01 }],
    ];
    for (const [what, over] of tries) {
      const r = stepQuests(defs, begun, { type: 'tick' }, night(over));
      assert.equal(r.states.name?.step, 0, `not ${what}`);
    }
    const r = stepQuests(defs, begun, { type: 'tick' }, night());
    assert.equal(r.states.name?.step, 1, 'all together: the cutscene may begin');
    assert.equal(r.states.name?.done, false);
    assert.equal(r.outcomes[0]?.effects.sparks, 0, 'nothing is paid before the reveal');
    assert.equal(objectiveOf(FINALE_QUEST, r.states.name!), null, 'no objective line');
  },
);

await check(
  'the reveal pays the sparks, the line and the fragment once, and ends the quest',
  () => {
    const defs = [FINALE_QUEST];
    let states = startQuests(defs, {}, night()).states;
    states = stepQuests(defs, states, { type: 'tick' }, night()).states;
    const early = stepQuests(defs, states, { type: 'tick' }, night());
    assert.equal(early.states.name?.done, false, 'only the cutscene ends it');
    const done = stepQuests(defs, states, { type: 'revealed' }, night());
    const effects = done.outcomes[0]?.effects;
    assert.equal(effects?.sparks, F.SPARKS);
    assert.deepEqual(effects?.beats, ['finale-done']);
    assert.deepEqual(effects?.fragments, [FRAGMENT_IDS.nameReturned]);
    assert.equal(effects?.questDone, true);
    const again = stepQuests(defs, done.states, { type: 'revealed' }, night());
    assert.equal(again.outcomes.length, 0, 'it pays once');
    assert.ok(MEMORY_FRAGMENTS[FRAGMENT_IDS.nameReturned]);
  },
);

finish('all quest content checks passed');
