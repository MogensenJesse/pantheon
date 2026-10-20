// scripts/checks/village/hamlet-check.ts — headless checks of the hamlet: how it starts, that it stays frozen,
// belief and faith, conversion (explicit, by the quest), and what happens after it.
// Run: node --experimental-strip-types scripts/checks/village/hamlet-check.ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VILLAGE } from '../../../src/config/village.ts';
import { Role, type VillageEvent } from '../../../src/world/village/model/types.ts';
import {
  beliefShare,
  believerIncome,
  countBelievers,
  raiseBelief,
} from '../../../src/world/village/sim/belief.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { DAY_S, loadMap, makeSim, simulate } from '../lib/villageHeadless.ts';

const { HAMLET, FAITH } = VILLAGE;

// --- the pure rules ---

await check('belief is clamped to 0..1 and reports only the step that reaches 1', () => {
  const belief = new Float32Array(3);
  assert.equal(raiseBelief(belief, 1, 0.4), false);
  assert.equal(raiseBelief(belief, 1, 0.4), false);
  assert.equal(raiseBelief(belief, 1, 0.4), true);
  assert.equal(belief[1], 1);
  assert.equal(raiseBelief(belief, 1, 0.4), false, 'already believing');
  raiseBelief(belief, 2, -5);
  assert.equal(belief[2], 0);
  assert.equal(countBelievers(belief, 3), 1);
  assert.ok(Math.abs(beliefShare(belief, 3) - 1 / 3) < 1e-9);
  assert.equal(beliefShare(belief, 0), 0);
});

await check('faith comes only from believers', () => {
  assert.equal(believerIncome(0), 0);
  assert.equal(believerIncome(10), 10 * FAITH.PER_BELIEVER_PER_SEC);
});

// --- the hamlet itself ---

const map = loadMap('island-mountain');
const DAY = (t: number) => (0.3 + t / DAY_S) % 1;
const make = (
  mode: 'hamlet' | 'sandbox' = 'hamlet',
  restore?: ReturnType<VillageSim['serialize']>,
) => makeSim(map, { mode, restore });

const hash = (sim: VillageSim) => {
  const v = sim.villagers;
  const h = createHash('sha1');
  h.update(JSON.stringify([sim.buildings, sim.fields, sim.faith, sim.converted, sim.elder]));
  for (const a of [v.x, v.z, v.role, v.home, v.belief]) {
    h.update(Buffer.from(a.buffer, a.byteOffset, v.count * a.BYTES_PER_ELEMENT));
  }
  return h.digest('hex').slice(0, 12);
};

await check(
  'a hamlet starts finished: temple, houses, fields, well, people, an elder who is a priest',
  () => {
    const sim = make();
    assert.ok(
      sim.buildings.every((b) => b.stage === 2),
      'every building is finished',
    );
    assert.equal(sim.buildings.filter((b) => b.type === 'temple').length, 1);
    assert.equal(sim.buildings.filter((b) => b.type.startsWith('house_')).length, HAMLET.HOUSES);
    assert.equal(sim.buildings.filter((b) => b.type === 'well').length, 1);
    assert.equal(sim.fields.length, HAMLET.FIELDS);
    assert.equal(sim.villagers.count, HAMLET.VILLAGERS);
    assert.equal(sim.stats().openSites, 0);
    assert.equal(sim.mode, 'hamlet');
    assert.equal(sim.converted, false);
    assert.ok(
      sim.elder >= 0 && sim.villagers.role[sim.elder] === Role.Priest,
      'the elder is a priest',
    );
    let builders = 0;
    for (let i = 0; i < sim.villagers.count; i++)
      if (sim.villagers.role[i] === Role.Builder) builders++;
    assert.equal(builders, 0, 'nothing to build, so no builders');
    assert.equal(sim.believers(), 0);
    assert.ok(sim.villagers.count <= sim.stats().beds, 'everyone has a bed');
  },
);

await check(
  'a hamlet that nobody converts stays exactly as it is for a day and a night, with no faith income',
  () => {
    const sim = make();
    const before = sim.stats();
    simulate(sim, { hours: 6, phase: DAY, vigil: false, presence: true });
    const after = sim.stats();
    assert.equal(after.buildings, before.buildings);
    assert.equal(after.villagers, before.villagers);
    assert.equal(after.fields, before.fields);
    assert.equal(after.openSites, 0);
    assert.equal(sim.faith.faith, FAITH.START, 'faith did not move');
    assert.equal(sim.faith.rate, 0, 'no believers, no income, even with the orb standing close');
  },
);

await check('faith flows from believers only: their count times the rate', () => {
  const sim = make();
  const events: VillageEvent[] = [];
  for (const i of [0, 1, 2]) sim.addBelief(i, 1, events);
  assert.equal(sim.believers(), 3);
  simulate(sim, { hours: 0.2, phase: DAY, vigil: false, presence: false });
  assert.ok(Math.abs(sim.faith.rate - 3 * FAITH.PER_BELIEVER_PER_SEC) < 1e-9, `${sim.faith.rate}`);
  assert.ok(sim.faith.faith > FAITH.START);
  assert.equal(sim.converted, false);
});

await check(
  'belief events: each convert once; belief alone never converts the village, convertVillage does, once',
  () => {
    const sim = make();
    const events: VillageEvent[] = [];
    const everyone = [...Array(sim.villagers.count).keys()];
    for (const i of everyone) sim.addBelief(i, 1, events);
    const converts = events.filter(
      (e): e is Extract<VillageEvent, { kind: 'villagerConverted' }> =>
        e.kind === 'villagerConverted',
    );
    assert.equal(converts.length, everyone.length);
    assert.equal(converts.at(-1)!.converts, sim.villagers.count, 'the count rises to everyone');
    assert.equal(
      sim.addBelief(everyone[0]!, 1, events),
      false,
      'already a believer: no second event',
    );
    assert.equal(
      events.some((e) => e.kind === 'villageConverted'),
      false,
      'the elder and everyone believing is not a conversion',
    );
    assert.equal(sim.converted, false);
    assert.equal(sim.convertVillage(events), true);
    assert.equal(sim.converted, true);
    assert.equal(events.filter((e) => e.kind === 'villageConverted').length, 1);
    assert.equal(sim.convertVillage(events), false, 'only once');
    assert.equal(events.filter((e) => e.kind === 'villageConverted').length, 1);
    assert.equal(
      make('sandbox').convertVillage([]),
      false,
      'a sandbox village is never a hamlet to convert',
    );
  },
);

await check(
  'after the conversion the hamlet grows: sites, newcomers who believe, builders, income',
  () => {
    const sim = make();
    const events: VillageEvent[] = [];
    for (let i = 0; i < 7; i++) sim.addBelief(i, 1, events);
    assert.ok(sim.convertVillage(events));
    const before = sim.stats();
    simulate(sim, { hours: 6, phase: DAY, vigil: false, presence: true });
    const after = sim.stats();
    assert.ok(
      after.buildings > before.buildings,
      `buildings ${before.buildings} to ${after.buildings}`,
    );
    assert.ok(
      after.villagers > before.villagers,
      `villagers ${before.villagers} to ${after.villagers}`,
    );
    const v = sim.villagers;
    for (let i = before.villagers; i < v.count; i++)
      assert.equal(v.belief[i], 1, `newcomer ${i} believes`);
    let builders = 0;
    for (let i = 0; i < v.count; i++) if (v.role[i] === Role.Builder) builders++;
    assert.ok(builders > 0, 'a building crew arrived');
    assert.ok(sim.faith.rate > 0);
  },
);

await check(
  'the same start gives the same hamlet; sandbox mode still grows by itself from the first minute',
  () => {
    assert.equal(hash(make()), hash(make()));
    const sandbox = make('sandbox');
    assert.equal(sandbox.converted, true);
    assert.equal(sandbox.mode, 'sandbox');
    assert.equal(sandbox.villagers.count, VILLAGE.VILLAGERS.START);
    assert.ok(
      sandbox.buildings.some((b) => b.stage < 2),
      'a foundation is open at the start',
    );
    const before = sandbox.stats().buildings;
    simulate(sandbox, { hours: 2, phase: DAY, vigil: false, presence: true });
    assert.ok(sandbox.stats().buildings > before);
    assert.ok(sandbox.faith.rate > 0, 'the flat base rate');
  },
);

await check('a hamlet saved and restored carries its belief, elder and conversion', () => {
  const sim = make();
  const events: VillageEvent[] = [];
  sim.addBelief(sim.elder, 1, events);
  sim.addBelief(3, 1, events);
  const copy = make('hamlet', sim.serialize());
  assert.equal(copy.elder, sim.elder);
  assert.equal(copy.converted, false);
  assert.equal(copy.believers(), 2);
  assert.equal(hash(copy), hash(sim));
  sim.convertVillage(events);
  assert.equal(make('hamlet', sim.serialize()).converted, true, 'a converted one stays converted');
});

finish('all hamlet checks passed');
