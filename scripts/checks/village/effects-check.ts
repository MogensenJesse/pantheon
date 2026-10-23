// scripts/checks/village/effects-check.ts — what finished buildings and their levels do: the farmstead's reach, the workshop's axes
// Run: node --experimental-strip-types --no-warnings scripts/checks/village/effects-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import type { Building } from '../../../src/world/village/model/types.ts';
import {
  chopMul,
  type FieldBonus,
  fieldBonus,
} from '../../../src/world/village/sim/buildingEffects.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
} from '../lib/villageHeadless.ts';

const E = VILLAGE.EFFECTS;
const map = loadMap('island-mountain');

const building = (type: string, over: Partial<Building> = {}): Building =>
  ({ id: 1, type, x: 0, z: 0, stage: 2, progress: 0, level: 1, upgrade: 0, ...over }) as Building;
const field = (x: number, z: number) => ({ x, z });
const bonusOf = (f: { x: number; z: number }, buildings: Building[]): FieldBonus =>
  fieldBonus(f, buildings, { growthMul: 1, yieldAdd: 0 });

await check(
  'with no farmstead near a field, nothing changes: the factor is 1 and the bonus 0',
  () => {
    const none = bonusOf(field(0, 0), []);
    assert.deepEqual(none, { growthMul: 1, yieldAdd: 0 });
    const other = [building('workshop'), building('granary'), building('house_a')];
    assert.deepEqual(bonusOf(field(0, 0), other), { growthMul: 1, yieldAdd: 0 });
    const far = [building('farmstead', { x: E.FARMSTEAD.RADIUS_M + 1 })];
    assert.deepEqual(bonusOf(field(0, 0), far), { growthMul: 1, yieldAdd: 0 }, 'out of reach');
    const open = [building('farmstead', { stage: 1 })];
    assert.deepEqual(bonusOf(field(0, 0), open), { growthMul: 1, yieldAdd: 0 }, 'not finished');
  },
);

await check('a farmstead helps the fields in its reach, more with each level', () => {
  const at = (level: number) => bonusOf(field(0, 0), [building('farmstead', { x: 30, level })]);
  const [l1, l2, l3] = [at(1), at(2), at(3)];
  assert.equal(l1.growthMul, 1 + E.FARMSTEAD.GROWTH_PER_LEVEL);
  assert.equal(l1.yieldAdd, E.FARMSTEAD.YIELD_PER_LEVEL);
  assert.ok(l2.growthMul > l1.growthMul && l3.growthMul > l2.growthMul);
  assert.ok(l2.yieldAdd > l1.yieldAdd && l3.yieldAdd > l2.yieldAdd);
  const edge = [building('farmstead', { x: E.FARMSTEAD.RADIUS_M })];
  assert.ok(bonusOf(field(0, 0), edge).growthMul > 1, 'the edge of the reach counts');
});

await check('farmsteads stack, up to the caps', () => {
  const many = Array.from({ length: 6 }, (_, i) =>
    building('farmstead', { id: i + 1, x: 10 + i, level: 3 }),
  );
  const out = bonusOf(field(0, 0), many);
  assert.equal(out.growthMul, 1 + E.FARMSTEAD.MAX_GROWTH_ADD);
  assert.equal(out.yieldAdd, E.FARMSTEAD.MAX_YIELD_ADD);
  const two = bonusOf(field(0, 0), [
    building('farmstead', { id: 1, x: 10 }),
    building('farmstead', { id: 2, x: -10 }),
  ]);
  assert.equal(two.growthMul, 1 + 2 * E.FARMSTEAD.GROWTH_PER_LEVEL);
});

await check('asking writes into the given record and allocates nothing else', () => {
  const out: FieldBonus = { growthMul: 9, yieldAdd: 9 };
  assert.equal(fieldBonus(field(0, 0), [], out), out);
  assert.deepEqual(out, { growthMul: 1, yieldAdd: 0 });
});

await check('a workshop at level 1 changes nothing; each level above speeds the axes', () => {
  assert.equal(chopMul([]), 1);
  assert.equal(chopMul([building('workshop')]), 1);
  assert.equal(chopMul([building('granary', { level: 3 }), building('house_a', { level: 3 })]), 1);
  const at = (level: number) => chopMul([building('workshop', { level })]);
  assert.equal(at(2), 1 + E.WORKSHOP.CHOP_PER_LEVEL);
  assert.ok(at(3) > at(2));
  assert.equal(chopMul([building('workshop', { level: 3, stage: 1 })]), 1, 'not finished');
  const many = Array.from({ length: 9 }, (_, i) => building('workshop', { id: i, level: 3 }));
  assert.equal(chopMul(many), 1 + E.WORKSHOP.MAX_CHOP_ADD, 'never beyond the cap');
});

/** A grown, converted village, made once and restored from for each check below. */
const grown = (() => {
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  stepSim(sim, { seconds: 2 * DAY_S, fed: true });
  return sim.serialize();
})();
const restored = (): VillageSim =>
  makeSim(map, { mode: 'hamlet', restore: structuredClone(grown) });

/** A finished farmstead dropped beside a field (the planner rules are not under test here). */
function addFarmstead(sim: VillageSim, fieldIndex: number, level: number): Building {
  const f = sim.fields[fieldIndex]!;
  const template = sim.buildings.find((b) => b.type === 'granary' && b.stage === 2);
  assert.ok(template, 'a finished building to copy');
  const id = Math.max(...sim.buildings.map((b) => b.id)) + 1;
  const farmstead: Building = { ...template, id, type: 'farmstead', x: f.x + 12, z: f.z, level };
  (sim.buildings as Building[]).push(farmstead);
  return farmstead;
}

await check('a farmstead lifts the harvest of a ripe field it reaches, and only that one', () => {
  const sim = restored();
  assert.ok(sim.fields.length >= 2, 'fields to compare');
  const near = sim.fields[0]!;
  const far = sim.fields.find(
    (f) => Math.hypot(f.x - near.x, f.z - near.z) > 2 * E.FARMSTEAD.RADIUS_M,
  );
  const ripe = (id: number) => {
    const f = sim.fields.find((x) => x.id === id)!;
    f.growth = 1;
    return sim.takeHarvest(id);
  };
  const plain = ripe(near.id);
  addFarmstead(sim, 0, 2);
  const boosted = ripe(near.id);
  assert.equal(boosted, plain + 2 * E.FARMSTEAD.YIELD_PER_LEVEL);
  if (far) assert.equal(ripe(far.id), plain, 'a field beyond the reach is as before');
});

await check('a farmstead makes the fields around it ripen faster', () => {
  const grow = (level: number | null) => {
    const sim = restored();
    if (level) addFarmstead(sim, 0, level);
    for (const f of sim.fields) f.growth = 0;
    stepSim(sim, { seconds: 60, from: 2 * DAY_S, fed: true });
    return sim.fields[0]!.growth;
  };
  const [none, l1, l3] = [grow(null), grow(1), grow(3)];
  assert.ok(none > 0, 'the field grows');
  assert.ok(
    l1 > none && l3 > l1,
    `growth ${none.toFixed(4)} < ${l1.toFixed(4)} < ${l3.toFixed(4)}`,
  );
});

await check(
  'a workshop raised above level 1 changes how the village chops, a level-1 one does not',
  () => {
    const run = (level: number) => {
      const sim = restored();
      for (const b of sim.buildings) if (b.type === 'workshop') b.level = level;
      stepSim(sim, { seconds: DAY_S / 2, from: 2 * DAY_S, fed: true });
      return savedHash(sim);
    };
    assert.equal(run(1), run(1), 'a straight run repeats');
    assert.notEqual(run(1), run(3), 'a level-3 workshop speeds the axes');
  },
);

await check('with the effects idle a run is the same as a run with no effects code at all', () => {
  // A village with no farmstead and level-1 workshops: the save after a day equals the plain run's.
  const a = restored();
  const b = restored();
  stepSim(a, { seconds: DAY_S / 2, from: 2 * DAY_S, fed: true });
  stepSim(b, { seconds: DAY_S / 2, from: 2 * DAY_S, fed: true });
  assert.equal(savedHash(a), savedHash(b));
  assert.equal(chopMul(a.buildings), 1, 'level-1 workshops');
});

finish('all building-effect checks passed');
