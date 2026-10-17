// scripts/village/hamlet-check.ts — headless checks of the hamlet: how it starts, that it stays frozen,
// belief and faith, the conversion rule, and what happens after the conversion.
// Run: node --experimental-strip-types scripts/village/hamlet-check.ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VILLAGE } from '../../src/config/village.ts';
import { Role, type VillageEvent } from '../../src/world/village/model/types.ts';
import {
  beliefShare,
  believerIncome,
  countBelievers,
  isVillageConverted,
  raiseBelief,
  requiredBelievers,
  SPARKS_AT_CONVERSION,
  sparksForConvert,
} from '../../src/world/village/sim/belief.ts';
import { createVillageSim, type VillageSim } from '../../src/world/village/sim/villageSim.ts';
import { DAY_S, loadMap, simulate } from '../lib/villageHeadless.ts';

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  const t0 = performance.now();
  try {
    await fn();
    console.log(`ok   ${name} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

const { HAMLET, FAITH } = VILLAGE;

// --- the pure rules ---

await check(
  'a village needs 60% of its people (at least one) to believe, the elder among them',
  () => {
    assert.equal(requiredBelievers(11), 7);
    assert.equal(requiredBelievers(10), 6);
    assert.equal(requiredBelievers(1), 1);
    assert.equal(requiredBelievers(0), 1);
    const belief = new Float32Array(11);
    assert.equal(isVillageConverted(belief, 11, 0), false);
    for (let i = 1; i <= 6; i++) belief[i] = 1;
    assert.equal(isVillageConverted(belief, 11, 0), false, 'six believers, elder not one of them');
    belief[0] = 1;
    assert.equal(isVillageConverted(belief, 11, 0), true, 'seven with the elder');
    belief[3] = 0.99;
    assert.equal(
      isVillageConverted(belief, 11, 0),
      false,
      'a belief of 0.99 is not yet a believer',
    );
    assert.equal(isVillageConverted(belief, 11, -1), false, 'no elder');
    assert.equal(isVillageConverted(belief, 11, 11), false, 'elder out of range');
  },
);

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

await check(
  'sparks: one per convert after the fifth, three for the conversion, faith only from believers',
  () => {
    assert.deepEqual([1, 5, 6, 7, 20].map(sparksForConvert), [0, 0, 1, 1, 1]);
    assert.equal(SPARKS_AT_CONVERSION, 3);
    assert.equal(believerIncome(0), 0);
    assert.equal(believerIncome(10), 10 * FAITH.PER_BELIEVER_PER_SEC);
  },
);

// --- the hamlet itself ---

const map = loadMap('island-mountain');
const DAY = (t: number) => (0.3 + t / DAY_S) % 1;
const make = (mode: 'hamlet' | 'sandbox' = 'hamlet') =>
  createVillageSim({
    sampler: map.sampler,
    metaOf: map.metaOf,
    seed: map.seed,
    trees: map.trees,
    mode,
  });

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
    const stages = sim.buildings.map((b) => b.stage);
    assert.ok(
      stages.every((s) => s === 2),
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

await check(
  'faith flows from believers only: their count times the rate, and the presence boost on top',
  () => {
    const sim = make();
    const events: VillageEvent[] = [];
    const elder = sim.elder;
    for (let i = 0; i < 3; i++) sim.addBelief(i === elder ? 4 : i, 1, events);
    const believers = sim.believers();
    assert.equal(believers, 3);
    simulate(sim, { hours: 0.2, phase: DAY, vigil: false, presence: false });
    assert.ok(
      Math.abs(sim.faith.rate - believers * FAITH.PER_BELIEVER_PER_SEC) < 1e-9,
      `${sim.faith.rate}`,
    );
    assert.ok(sim.faith.faith > FAITH.START);
    assert.equal(sim.converted, false);
  },
);

await check(
  'belief events: each convert once, the village once, only with the elder and 60%',
  () => {
    const sim = make();
    const events: VillageEvent[] = [];
    const need = requiredBelievers(sim.villagers.count);
    const others = [...Array(sim.villagers.count).keys()].filter((i) => i !== sim.elder);
    // Everyone but the elder: not converted, however many.
    for (const i of others) sim.addBelief(i, 1, events);
    assert.equal(events.filter((e) => e.kind === 'villagerConverted').length, others.length);
    assert.equal(
      events.some((e) => e.kind === 'villageConverted'),
      false,
      'no conversion without the elder',
    );
    assert.equal(sim.converted, false);
    assert.equal(
      sim.addBelief(others[0]!, 1, events),
      false,
      'already a believer: no second event',
    );
    // Partial belief is not belief.
    sim.addBelief(sim.elder, 0.9, events);
    assert.equal(sim.converted, false);
    assert.equal(sim.addBelief(sim.elder, 0.2, events), true);
    assert.equal(events.filter((e) => e.kind === 'villageConverted').length, 1);
    assert.equal(sim.converted, true);
    const last = events
      .filter(
        (e): e is Extract<VillageEvent, { kind: 'villagerConverted' }> =>
          e.kind === 'villagerConverted',
      )
      .at(-1)!;
    assert.equal(last.converts, sim.villagers.count, 'the count rises to everyone');
    assert.ok(sim.believers() >= need);
    sim.addBelief(1, 0.5, events);
    assert.equal(events.filter((e) => e.kind === 'villageConverted').length, 1, 'only once');
  },
);

await check(
  'the elder first, then just enough: the conversion comes with the seventh believer of eleven',
  () => {
    const sim = make();
    const events: VillageEvent[] = [];
    const order = [
      sim.elder,
      ...[...Array(sim.villagers.count).keys()].filter((i) => i !== sim.elder),
    ];
    const need = requiredBelievers(sim.villagers.count);
    for (let n = 0; n < need - 1; n++) sim.addBelief(order[n]!, 1, events);
    assert.equal(sim.converted, false, `${need - 1} believers`);
    sim.addBelief(order[need - 1]!, 1, events);
    assert.equal(sim.converted, true, `${need} believers`);
  },
);

await check(
  'after the conversion the hamlet grows: sites, newcomers who believe, builders, income',
  () => {
    const sim = make();
    const events: VillageEvent[] = [];
    const order = [
      sim.elder,
      ...[...Array(sim.villagers.count).keys()].filter((i) => i !== sim.elder),
    ];
    for (const i of order.slice(0, requiredBelievers(sim.villagers.count)))
      sim.addBelief(i, 1, events);
    assert.equal(sim.converted, true);
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
  const state = sim.serialize();
  const copy = createVillageSim({
    sampler: map.sampler,
    metaOf: map.metaOf,
    seed: map.seed,
    trees: map.trees,
    mode: 'hamlet',
    restore: state,
  });
  assert.equal(copy.elder, sim.elder);
  assert.equal(copy.converted, false);
  assert.equal(copy.believers(), 2);
  assert.equal(hash(copy), hash(sim));
  // A converted one stays converted.
  for (let i = 0; i < sim.villagers.count; i++) sim.addBelief(i, 1, events);
  const open = createVillageSim({
    sampler: map.sampler,
    metaOf: map.metaOf,
    seed: map.seed,
    trees: map.trees,
    mode: 'hamlet',
    restore: sim.serialize(),
  });
  assert.equal(open.converted, true);
});

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall hamlet checks passed');
