// scripts/checks/quests/quest-content-check.ts — headless checks of the quests that ship: the eight
// teaching quests and Caros's five favours begin when they should, finish on their own event, pay once
// and say what they say.
//
//   node --experimental-strip-types scripts/checks/quests/quest-content-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { FAVOUR_FRAGMENTS, FAVOUR_QUESTS } from '../../../src/quests/favourQuests.ts';
import { FINALE_FRAGMENT, FINALE_QUEST } from '../../../src/quests/finale.ts';
import { buildFinaleTimeline } from '../../../src/quests/finaleTimeline.ts';
import { objectiveOf, type QuestContext, type QuestEvent } from '../../../src/quests/quest.ts';
import {
  MAX_TEACHING_OPEN,
  type QuestsState,
  startQuests,
  stepQuests,
} from '../../../src/quests/questLog.ts';
import { QUESTS } from '../../../src/quests/registry.ts';
import { TEACHING_QUESTS } from '../../../src/quests/teachingQuests.ts';
import { MEMORY_FRAGMENTS } from '../../../src/story/fragments.ts';
import { check, finish } from '../lib/check.ts';

const world = (over: Partial<QuestContext> = {}): QuestContext => ({
  converts: 11,
  elderBelieves: true,
  converted: true,
  population: 11,
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
        { type: 'heartened', villager: 3, mended: false, aera: false },
        { type: 'heartened', villager: 3, mended: true, aera: false },
      ],
    ],
    [
      'raised',
      { upgradable: true },
      [{ type: 'tick' }, { type: 'milestone', id: 'level_2' }],
      { milestones: ['level_2'] },
    ],
    [
      'first-place',
      { awake: ['tree'] },
      [{ type: 'restored', kind: 'tree' }],
      { milestones: ['first_place'] },
    ],
    ['beyond-fence', { milestones: ['first_place'] }, [{ type: 'outpostDone', kind: 'lumber' }]],
    [
      'hard-winter',
      { hunger: 'weak' },
      [
        { type: 'hunger', stage: 'weak' },
        { type: 'hunger', stage: 'recovered' },
      ],
    ],
    [
      'many-hands',
      { population: 15 },
      [{ type: 'tick' }, { type: 'milestone', id: 'folk_20' }],
      { milestones: ['folk_20'] },
    ],
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
  assert.equal(FAVOUR_QUESTS.length, 5);
  for (const def of FAVOUR_QUESTS) {
    const kind = def.id.replace('favour-', '');
    assert.equal(begins(def.id, world()), false, `${def.id} waits for its place`);
    assert.equal(
      begins(def.id, world({ awake: ['monolith', 'tree'].filter((k) => k !== kind) })),
      false,
    );
    assert.equal(begins(def.id, world({ awake: [kind], converted: false })), false);
    assert.equal(begins(def.id, world({ awake: [kind] })), true, `${def.id} begins`);
  }
});

await check('the favours finish by their rule and tell their fragment once', () => {
  const pray = (need: string): QuestEvent => ({ type: 'prayer', need, state: 'answered' });
  const cases: [string, QuestEvent[], QuestEvent[]][] = [
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
      [{ type: 'heartened', villager: 4, mended: true, aera: false }],
      [{ type: 'heartened', villager: 0, mended: false, aera: true }],
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
    assert.deepEqual(done.fragments, [FAVOUR_FRAGMENTS[kind as keyof typeof FAVOUR_FRAGMENTS]]);
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
  for (const [kind, id] of Object.entries(FAVOUR_FRAGMENTS)) {
    assert.ok(MEMORY_FRAGMENTS[id], `${kind}: fragment ${id}`);
  }
  assert.equal(new Set(Object.values(FAVOUR_FRAGMENTS)).size, 5);
});

// ---- the last night ----

const F = PHASE0.QUEST.FINALE;
const night = (over: Partial<QuestContext> = {}) =>
  world({
    allRestored: true,
    dusk: true,
    orbAtTemple: true,
    energy: PHASE0.QUEST.OFFERING_MIN_ENERGY,
    templeShare: F.GATHER_SHARE,
    ...over,
  });

await check('the last night is called only when every place is restored', () => {
  assert.equal(begins(FINALE_QUEST.id, world()), false);
  assert.equal(begins(FINALE_QUEST.id, world({ restored: ['tree'], allRestored: false })), false);
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
      ['without energy', { energy: PHASE0.QUEST.OFFERING_MIN_ENERGY - 1 }],
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
    assert.deepEqual(effects?.fragments, [FINALE_FRAGMENT]);
    assert.equal(effects?.questDone, true);
    const again = stepQuests(defs, done.states, { type: 'revealed' }, night());
    assert.equal(again.outcomes.length, 0, 'it pays once');
    assert.ok(MEMORY_FRAGMENTS[FINALE_FRAGMENT]);
  },
);

const PLACES = [
  { kind: 'runestones', x: 100, z: 0 },
  { kind: 'tree', x: 0, z: 120 },
  { kind: 'temple_ruin', x: -90, z: 10 },
  { kind: 'sunken_ruin', x: -20, z: -110 },
  { kind: 'monolith', x: 60, z: 90 },
] as const;
const TEMPLE = { x: 0, z: 0 };
const CUT = F.CUTSCENE;

await check(
  'the cutscene raises a beam at each place in turn and keeps the rune dark meanwhile',
  () => {
    const tl = buildFinaleTimeline(PLACES, TEMPLE);
    const expected = CUT.INTRO_S + PLACES.length * CUT.PLACE_S + CUT.RETURN_S + CUT.HOLD_S;
    assert.ok(Math.abs(tl.duration - expected) < 1e-9, 'the slots add up to the duration');
    const start = tl.at(0);
    for (const p of PLACES) {
      assert.equal(start.beams[p.kind], 0, 'it opens dark');
      assert.equal(start.strokes[p.kind], 0);
    }
    assert.equal(start.glow, 0);
    for (const [i, p] of PLACES.entries()) {
      const slot = CUT.INTRO_S + i * CUT.PLACE_S;
      const before = tl.at(slot + CUT.BEAM_AT_S - 0.01);
      assert.equal(before.beams[p.kind], 0, `${p.kind}: no beam before its moment`);
      const during = tl.at(slot + CUT.BEAM_AT_S + CUT.BEAM_RISE_S * 0.5);
      assert.ok(
        (during.beams[p.kind] ?? 0) > 0 && (during.beams[p.kind] ?? 0) < 1,
        `${p.kind} rises`,
      );
      const after = tl.at(slot + CUT.PLACE_S - 0.01);
      assert.equal(after.beams[p.kind], 1, `${p.kind}: the beam is whole by the end of its slot`);
      assert.equal(after.strokes[p.kind], 0, `${p.kind}: its stroke waits for the return shot`);
      assert.equal(after.glow, 0, 'and so does the rune');
      // The view is at the place while its beam rises.
      const v = during.view;
      assert.ok(Math.hypot(v.x - p.x, v.z - p.z) < 25, `${p.kind}: the view is on the place`);
      const next = PLACES[i + 1];
      if (next) {
        assert.equal(tl.at(slot + CUT.PLACE_S - 0.01).beams[next.kind], 0, 'the next place waits');
      }
    }
  },
);

await check(
  'the strokes light one after another in the return shot, then the rune glows whole',
  () => {
    const tl = buildFinaleTimeline(PLACES, TEMPLE);
    const placesEnd = CUT.INTRO_S + PLACES.length * CUT.PLACE_S;
    const first = placesEnd + CUT.RETURN_S * CUT.STROKES_AT;
    let before = tl.at(first - 0.01);
    assert.equal(before.glow, 0, 'dark until the first stroke');
    for (const [i, p] of PLACES.entries()) {
      const start = first + i * CUT.STROKE_STAGGER_S;
      before = tl.at(start - 0.01);
      assert.equal(before.strokes[p.kind], 0, `${p.kind}: not before its turn`);
      const done = tl.at(start + CUT.STROKE_FADE_S);
      assert.equal(done.strokes[p.kind], 1, `${p.kind}: lit after its fade`);
      assert.ok(done.glow >= CUT.GLOW_BASE * 0.99 || i === 0, 'the rune glows once strokes show');
      const next = PLACES[i + 1];
      if (next)
        assert.ok((tl.at(start + CUT.STROKE_STAGGER_S - 0.01).strokes[next.kind] ?? 0) < 0.01);
    }
    assert.ok(tl.at(first + 0.5).glow > 0, 'the glow starts with the first stroke');
  },
);

await check('the view is continuous: the first glide leaves the opening look where it is', () => {
  const tl = buildFinaleTimeline(PLACES, TEMPLE);
  for (const t of [
    CUT.INTRO_S,
    CUT.INTRO_S + CUT.PLACE_S,
    CUT.INTRO_S + CUT.PLACE_S * PLACES.length,
  ]) {
    const a = tl.at(t - 1e-3).view;
    const b = tl.at(t + 1e-3).view;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.5, `no jump in position at ${t}`);
    // Angles may differ by whole turns.
    const turn = Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw));
    assert.ok(Math.abs(turn) < 0.01, `no snap in yaw at ${t}`);
  }
});

await check('the cutscene returns to the temple, lights the whole rune and holds', () => {
  const tl = buildFinaleTimeline(PLACES, TEMPLE);
  const end = tl.at(tl.duration);
  assert.equal(end.glow, 1, 'the rune is at full glow');
  for (const p of PLACES) {
    assert.equal(end.beams[p.kind], 1);
    assert.equal(end.strokes[p.kind], 1);
  }
  assert.ok(
    Math.hypot(end.view.x - TEMPLE.x, end.view.z - TEMPLE.z) < 1e-6,
    'it ends over the temple',
  );
  assert.ok(end.view.lookM > CUT.RUNE_HEIGHT_M * 0.99, 'looking up at the rune');
  assert.deepEqual(tl.at(tl.duration + 50), end, 'past the end it stays');
  assert.deepEqual(tl.at(-5), tl.at(0), 'before the start it stays');
  // Skipping jumps to the end: every frame is whole and the glow never falls back.
  let glow = 0;
  for (let t = 0; t <= tl.duration; t += 0.25) {
    const f = tl.at(t);
    assert.ok(f.glow >= glow - 1e-9, 'the glow only rises');
    glow = f.glow;
    for (const p of PLACES) {
      if ((f.strokes[p.kind] ?? 0) > 0) {
        assert.ok((f.beams[p.kind] ?? 0) > 0, 'a stroke lights only once its beam is rising');
      }
    }
  }
});

await check('the cutscene copes with a map that has fewer places or none', () => {
  const some = buildFinaleTimeline(PLACES.slice(0, 2), TEMPLE);
  assert.equal(some.at(some.duration).glow, 1);
  const none = buildFinaleTimeline([], TEMPLE);
  assert.ok(Number.isFinite(none.duration) && none.duration > 0);
  assert.ok(Number.isFinite(none.at(1).view.x));
});

finish('all quest content checks passed');
