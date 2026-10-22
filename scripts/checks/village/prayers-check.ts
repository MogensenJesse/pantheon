// scripts/checks/village/prayers-check.ts — prayers: needs, answers, lapsed belief, indices and the save
// Run: node --experimental-strip-types --no-warnings scripts/checks/village/prayers-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { Role, type VillageEvent } from '../../../src/world/village/model/types.ts';
import {
  createPrayersState,
  type PrayerWorld,
  prayerOf,
  prayersProblem,
  removeVillager,
  restoreBelief,
  stepPrayers,
} from '../../../src/world/village/sim/prayers.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
  withNoFood,
} from '../lib/villageHeadless.ts';

const P = VILLAGE.PRAYERS;

/** A small world for the pure rules: n believers, all housed, fed, with a field and no rain. */
const world = (n: number, over: Partial<PrayerWorld> = {}): PrayerWorld => ({
  count: n,
  belief: new Float32Array(n).fill(1),
  dying: new Float32Array(n),
  role: new Uint8Array(n).fill(Role.Idler),
  home: new Int32Array(n).fill(1),
  foodShort: false,
  hasFields: true,
  rain01: 0.5,
  ...over,
});
const run = (s: ReturnType<typeof createPrayersState>, w: PrayerWorld, seconds: number) => {
  const all = [];
  for (let t = 0; t < seconds; t += 1) all.push(...stepPrayers(s, 1, w, true));
  return all;
};

await check('nobody prays before the village is converted, or with no need', () => {
  const s = createPrayersState();
  const w = world(4, { foodShort: true });
  assert.equal(stepPrayers(s, 1000, w, false).length, 0);
  assert.equal(run(createPrayersState(), world(4), 3 * DAY_S).length, 0);
});

await check('a need that holds long enough opens a prayer, from a believer, once', () => {
  const s = createPrayersState();
  const w = world(5, { foodShort: true });
  w.belief[0] = 0.3; // not a believer
  const early = run(s, w, VILLAGE.PRAYERS.NEED_DAYS.food * DAY_S - 5);
  assert.equal(early.length, 0, 'not yet');
  const opened = run(s, w, 20).filter((o) => o.kind === 'opened');
  assert.equal(opened.length, 1);
  assert.equal(opened[0]!.prayer.kind, 'food');
  assert.equal(opened[0]!.prayer.villager, 1, 'the first believer');
  assert.equal(prayerOf(s, 1)?.kind, 'food');
});

await check('rain: a farmer prays after a dry spell, and rain answers', () => {
  const s = createPrayersState();
  const w = world(4, { rain01: 0 });
  w.role[2] = Role.Farmer;
  run(s, w, P.NEED_DAYS.rain * DAY_S + 5);
  assert.equal(s.open.length, 1);
  assert.equal(s.open[0]!.villager, 2);
  assert.equal(s.open[0]!.kind, 'rain');
  w.rain01 = 0.6;
  const out = run(s, w, 2);
  assert.deepEqual(
    out.map((o) => o.kind),
    ['answered'],
  );
  assert.equal(s.answered, 1);
  assert.equal(s.open.length, 0);
});

await check('shelter: a homeless believer prays, and a bed answers', () => {
  const s = createPrayersState();
  const w = world(4);
  w.home[3] = 0;
  run(s, w, P.NEED_DAYS.shelter * DAY_S + 5);
  assert.equal(s.open[0]?.villager, 3);
  w.home[3] = 7;
  assert.equal(run(s, w, 2)[0]?.kind, 'answered');
});

await check(
  'an answer restores belief; an unanswered prayer lapses and the belief drops below 1',
  () => {
    const s = createPrayersState();
    const w = world(4, { foodShort: true });
    run(s, w, P.NEED_DAYS.food * DAY_S + 5);
    assert.equal(s.open.length, 1);
    const who = s.open[0]!.villager;
    const out = run(s, w, P.PATIENCE_DAYS * DAY_S + 5);
    assert.ok(out.some((o) => o.kind === 'lapsed'));
    assert.equal(w.belief[who], P.LAPSED_BELIEF);
    assert.deepEqual(s.lapsed, [who]);
    // another believer prays now (the lapsed one is no believer)
    assert.ok(s.open.every((p) => p.villager !== who));
  },
);

await check('the lapsed come back after a calm spell, or at once when restored', () => {
  const s = createPrayersState();
  const w = world(4, { foodShort: true });
  run(s, w, P.NEED_DAYS.food * DAY_S + P.PATIENCE_DAYS * DAY_S + 20);
  const who = s.lapsed[0]!;
  w.foodShort = false; // the larder fills: open prayers are answered, no new ones
  run(s, w, 5);
  assert.equal(s.open.length, 0);
  assert.ok(w.belief[who]! < 1, 'still low right after');
  run(s, w, P.RECOVER_DAYS * DAY_S + 5);
  assert.equal(w.belief[who], 1);
  assert.equal(s.lapsed.length, 0);

  const t = createPrayersState();
  const w2 = world(3, { foodShort: true });
  run(t, w2, P.NEED_DAYS.food * DAY_S + P.PATIENCE_DAYS * DAY_S + 20);
  const lapsed = t.lapsed[0]!;
  assert.equal(restoreBelief(t, w2, lapsed), true);
  assert.equal(w2.belief[lapsed], 1);
});

await check('no more than MAX_OPEN prayers at once, one per villager', () => {
  const s = createPrayersState();
  const w = world(9, { foodShort: true, rain01: 0 });
  for (let i = 0; i < 9; i++) w.home[i] = i < 4 ? 0 : 1;
  run(s, w, 5 * DAY_S);
  assert.ok(s.open.length <= P.MAX_OPEN);
  assert.equal(new Set(s.open.map((p) => p.villager)).size, s.open.length);
});

await check('prayers and the lapsed follow a villager who is moved or removed', () => {
  const s = createPrayersState();
  s.open = [
    { villager: 1, kind: 'food', age: 5 },
    { villager: 4, kind: 'rain', age: 9 },
  ];
  s.lapsed = [4, 2];
  removeVillager(s, 1, 4); // villager 1 is removed, villager 4 took its place
  assert.deepEqual(s.open, [{ villager: 1, kind: 'rain', age: 9 }]);
  assert.deepEqual(s.lapsed, [1, 2]);
  removeVillager(s, 1, -1);
  assert.equal(s.open.length, 0);
});

await check('a saved prayers state is checked', () => {
  const good = createPrayersState();
  assert.equal(prayersProblem(good, 5), null);
  assert.ok(prayersProblem(null, 5));
  assert.ok(prayersProblem({ ...good, open: [{ villager: 9, kind: 'food', age: 0 }] }, 5));
  assert.ok(prayersProblem({ ...good, open: [{ villager: 1, kind: 'gold', age: 0 }] }, 5));
  assert.ok(prayersProblem({ ...good, held: [0] }, 5));
  assert.ok(prayersProblem({ ...good, answered: -1 }, 5));
});

// --- in the village ---

const map = loadMap('island-mountain');
const grown = () => {
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  stepSim(sim, { seconds: DAY_S, fed: true });
  return sim;
};
const prayerEvents = (log: readonly VillageEvent[]) =>
  log.filter((e) => e.kind.startsWith('prayer')).map((e) => e.kind);

await check('a starving village prays for food, and answering pays faith and counts', () => {
  const sim = grown();
  withNoFood(() => {
    sim.starve([]);
    const log = stepSim(sim, { seconds: 0.5 * DAY_S, from: DAY_S });
    assert.ok(prayerEvents(log).includes('prayerOpened'), 'someone prays');
  });
  assert.ok(sim.prayers.open.some((p) => p.kind === 'food'));
  const faith = sim.faith.faith;
  sim.economy.addFood(Number.POSITIVE_INFINITY);
  const log = stepSim(sim, { seconds: 0.8 * DAY_S, from: 1.5 * DAY_S, fed: true });
  assert.ok(prayerEvents(log).includes('prayerAnswered'));
  assert.ok(sim.prayers.answered >= 1);
  assert.ok(sim.faith.faith > faith, 'a lump of faith was paid');
});

await check('an unanswered prayer costs that villager their belief and the faith income', () => {
  const sim = grown();
  const believers = sim.believers();
  withNoFood(() => {
    sim.starve([]);
    const log = stepSim(sim, { seconds: 2.4 * DAY_S, from: DAY_S });
    assert.ok(prayerEvents(log).includes('prayerLapsed'));
  });
  assert.ok(sim.prayers.lapsed.length >= 1 || sim.villagers.count < believers);
  assert.ok(sim.believers() < believers, 'fewer believe');
});

await check('a village mid-prayer saves and goes on the same', () => {
  const sim = grown();
  withNoFood(() => {
    sim.starve([]);
    stepSim(sim, { seconds: 0.4 * DAY_S, from: DAY_S });
  });
  assert.ok(sim.prayers.open.length > 0);
  const copy = makeSim(map, { mode: 'hamlet', restore: structuredClone(sim.serialize()) });
  assert.equal(savedHash(copy), savedHash(sim));
  const rest = { seconds: 0.4 * DAY_S, from: 1.4 * DAY_S, fed: true } as const;
  stepSim(sim, rest);
  stepSim(copy, rest);
  assert.equal(savedHash(copy), savedHash(sim));
});

await check('a hamlet that is not converted has no prayers', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  withNoFood(() => {
    sim.starve([]);
    stepSim(sim, { seconds: DAY_S });
  });
  assert.equal(sim.prayers.open.length, 0);
});

finish('all prayer checks passed');
