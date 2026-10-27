// scripts/checks/village/effects-check.ts — what finished buildings and their levels do: the farmstead's reach, the workshop's axes
// Run: node --experimental-strip-types --no-warnings scripts/checks/village/effects-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { neutralModifiers } from '../../../src/skills/modifiers.ts';
import type { Building } from '../../../src/world/village/model/types.ts';
import {
  chopMul,
  type FieldBonus,
  fieldBonus,
  shrineFaith,
} from '../../../src/world/village/sim/buildingEffects.ts';
import { createFaithState, stepFaith } from '../../../src/world/village/sim/faith.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  buildingOf,
  DAY_S,
  grownVillage,
  loadMap,
  makeSim,
  stepSim,
} from '../lib/villageHeadless.ts';

const E = VILLAGE.EFFECTS;
const map = loadMap('island-mountain');

const field = (x: number, z: number) => ({ x, z });
const bonusOf = (f: { x: number; z: number }, buildings: Building[]): FieldBonus =>
  fieldBonus(f, buildings, { growthMul: 1, yieldAdd: 0 });

await check(
  'with no farmstead near a field, nothing changes: the factor is 1 and the bonus 0',
  () => {
    const none = bonusOf(field(0, 0), []);
    assert.deepEqual(none, { growthMul: 1, yieldAdd: 0 });
    const other = [buildingOf('workshop'), buildingOf('granary'), buildingOf('house_a')];
    assert.deepEqual(bonusOf(field(0, 0), other), { growthMul: 1, yieldAdd: 0 });
    const far = [buildingOf('farmstead', { x: E.FARMSTEAD.RADIUS_M + 1 })];
    assert.deepEqual(bonusOf(field(0, 0), far), { growthMul: 1, yieldAdd: 0 }, 'out of reach');
    const open = [buildingOf('farmstead', { stage: 1 })];
    assert.deepEqual(bonusOf(field(0, 0), open), { growthMul: 1, yieldAdd: 0 }, 'not finished');
  },
);

await check('a farmstead helps the fields in its reach, more with each level', () => {
  const at = (level: number) => bonusOf(field(0, 0), [buildingOf('farmstead', { x: 30, level })]);
  const [l1, l2, l3] = [at(1), at(2), at(3)];
  assert.equal(l1.growthMul, 1 + E.FARMSTEAD.GROWTH_PER_LEVEL);
  assert.equal(l1.yieldAdd, E.FARMSTEAD.YIELD_PER_LEVEL);
  assert.ok(l2.growthMul > l1.growthMul && l3.growthMul > l2.growthMul);
  assert.ok(l2.yieldAdd > l1.yieldAdd && l3.yieldAdd > l2.yieldAdd);
  const edge = [buildingOf('farmstead', { x: E.FARMSTEAD.RADIUS_M })];
  assert.ok(bonusOf(field(0, 0), edge).growthMul > 1, 'the edge of the reach counts');
});

await check('farmsteads stack, up to the caps', () => {
  const many = Array.from({ length: 6 }, (_, i) =>
    buildingOf('farmstead', { id: i + 1, x: 10 + i, level: 3 }),
  );
  const out = bonusOf(field(0, 0), many);
  assert.equal(out.growthMul, 1 + E.FARMSTEAD.MAX_GROWTH_ADD);
  assert.equal(out.yieldAdd, E.FARMSTEAD.MAX_YIELD_ADD);
  const two = bonusOf(field(0, 0), [
    buildingOf('farmstead', { id: 1, x: 10 }),
    buildingOf('farmstead', { id: 2, x: -10 }),
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
  assert.equal(chopMul([buildingOf('workshop')]), 1);
  assert.equal(
    chopMul([buildingOf('granary', { level: 3 }), buildingOf('house_a', { level: 3 })]),
    1,
  );
  const at = (level: number) => chopMul([buildingOf('workshop', { level })]);
  assert.equal(at(2), 1 + E.WORKSHOP.CHOP_PER_LEVEL);
  assert.ok(at(3) > at(2));
  assert.equal(chopMul([buildingOf('workshop', { level: 3, stage: 1 })]), 1, 'not finished');
  const many = Array.from({ length: 9 }, (_, i) => buildingOf('workshop', { id: i, level: 3 }));
  assert.equal(chopMul(many), 1 + E.WORKSHOP.MAX_CHOP_ADD, 'never beyond the cap');
});

/** A grown, converted village, made once and restored from for each check below. */
const grown = grownVillage(map);
const restored = (): VillageSim => grown.restore();

/** A finished building of any type dropped in (the planner rules are not under test here). */
function addFinished(
  sim: VillageSim,
  type: Building['type'],
  x: number,
  z: number,
  level: number,
): Building {
  const template = sim.buildings.find((b) => b.type === 'granary' && b.stage === 2);
  assert.ok(template, 'a finished building to copy');
  const id = Math.max(...sim.buildings.map((b) => b.id)) + 1;
  const added: Building = { ...template, id, type, x, z, level };
  (sim.buildings as Building[]).push(added);
  return added;
}
/** A finished farmstead beside a field. */
function addFarmstead(sim: VillageSim, fieldIndex: number, level: number): Building {
  const f = sim.fields[fieldIndex]!;
  return addFinished(sim, 'farmstead', f.x + 12, f.z, level);
}

await check('a farmstead lifts the harvest of a ripe field it reaches, and only that one', () => {
  const sim = restored();
  assert.ok(sim.fields.length >= 2, 'fields to compare');
  const [near, other] = [sim.fields[0]!, sim.fields[1]!];
  const ripe = (id: number) => {
    const f = sim.fields.find((x) => x.id === id)!;
    f.growth = 1;
    return sim.takeHarvest(id);
  };
  const plain = ripe(near.id);
  const plainOther = ripe(other.id);
  // The farmstead stands on the far side of `near`, well inside its reach, and so farther than the reach from `other`.
  const away = Math.atan2(near.z - other.z, near.x - other.x);
  const gap = 0.9 * E.FARMSTEAD.RADIUS_M;
  const [x, z] = [near.x + Math.cos(away) * gap, near.z + Math.sin(away) * gap];
  assert.ok(
    Math.hypot(x - other.x, z - other.z) > E.FARMSTEAD.RADIUS_M,
    'the other is out of reach',
  );
  addFinished(sim, 'farmstead', x, z, 2);
  assert.equal(ripe(near.id), plain + 2 * E.FARMSTEAD.YIELD_PER_LEVEL);
  assert.equal(ripe(other.id), plainOther, 'a field beyond the reach is as before');
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
  'a workshop raised above level 1 brings in more wood in the same time, by at least what its axes promise',
  () => {
    const gain = (level: number) => {
      const sim = restored();
      for (const b of sim.buildings) if (b.type === 'workshop') b.level = level;
      const before = sim.economy.stock.wood;
      stepSim(sim, { seconds: DAY_S / 2, from: 2 * DAY_S, fed: true });
      return { wood: sim.economy.stock.wood - before, mul: chopMul(sim.buildings) };
    };
    const [l1, l2, l3] = [gain(1), gain(2), gain(3)];
    assert.equal(l1.mul, 1, 'the grown village starts with level-1 workshops');
    assert.ok(l1.wood > 0, 'the village chops');
    // Whole trees come in, so the gain steps; it never falls short of the speed-up the level gives.
    for (const l of [l2, l3]) assert.ok(l.wood >= l1.wood * l.mul, `${l.wood} wood at x${l.mul}`);
    assert.ok(l3.wood > l2.wood && l2.wood > l1.wood, `${l1.wood} < ${l2.wood} < ${l3.wood}`);
  },
);

// --- faith: the shrines and the multiplier ---

await check(
  'shrines add faith by their levels, capped; others and unfinished ones add none',
  () => {
    assert.equal(shrineFaith([]), 0);
    assert.equal(shrineFaith([buildingOf('farmstead'), buildingOf('temple')]), 0);
    assert.equal(shrineFaith([buildingOf('shrine', { stage: 1 })]), 0, 'not finished');
    const one = shrineFaith([buildingOf('shrine')]);
    assert.equal(one, E.SHRINE.FAITH_PER_LEVEL);
    assert.equal(shrineFaith([buildingOf('shrine', { level: 3 })]), 3 * one);
    const many = Array.from({ length: 12 }, (_, i) => buildingOf('shrine', { id: i, level: 3 }));
    assert.equal(shrineFaith(many), E.SHRINE.MAX_FAITH_ADD);
  },
);

await check('the faith step: no bonus and no multiplier is the old rate, to the bit', () => {
  const run = (inputs: Parameters<typeof stepFaith>[2]) => {
    const state = createFaithState();
    for (let k = 0; k < 50; k++) stepFaith(state, 0.1, inputs);
    return state;
  };
  const near = { playerDistM: 5, presenceActive: true };
  for (const base of [undefined, 0.3]) {
    const plain = run({ ...near, baseRate: base });
    const idle = run({ ...near, baseRate: base, bonusRate: 0, mul: 1 });
    assert.deepEqual(idle, plain);
  }
});

await check(
  'the faith step: the bonus and the multiplier raise the income, the presence goes on top',
  () => {
    const rateOf = (inputs: Parameters<typeof stepFaith>[2]) => {
      const state = createFaithState();
      stepFaith(state, 0.1, inputs);
      return state.rate;
    };
    const away = { playerDistM: null, presenceActive: false, baseRate: 0.2 };
    assert.equal(rateOf(away), 0.2);
    assert.ok(Math.abs(rateOf({ ...away, bonusRate: 0.1 }) - 0.3) < 1e-12, 'the bonus adds');
    assert.ok(Math.abs(rateOf({ ...away, mul: 1.25 }) - 0.25) < 1e-12, 'the multiplier scales');
    assert.ok(
      Math.abs(rateOf({ ...away, bonusRate: 0.1, mul: 2 }) - 0.6) < 1e-12,
      'the multiplier takes the bonus too',
    );
    const near = { ...away, playerDistM: 1, presenceActive: true };
    const state = createFaithState();
    for (let k = 0; k < 600; k++) stepFaith(state, 0.1, { ...near, bonusRate: 0.1, mul: 2 });
    assert.ok(state.boost01 > 0.9, 'the orb has settled in');
    const expected = 0.6 * (1 + (VILLAGE.FAITH.PRESENCE_MUL - 1) * state.boost01);
    assert.ok(Math.abs(state.rate - expected) < 1e-9, 'presence multiplies on top');
  },
);

/** The faith rate after a few steps with nobody near, so only the income shows. */
function incomeOf(sim: VillageSim): number {
  stepSim(sim, { seconds: 1, from: 2 * DAY_S, away: true });
  return sim.faith.rate;
}

await check("a finished shrine adds to a hamlet's faith income, a higher level adds more", () => {
  const none = incomeOf(restored());
  const at = (level: number) => {
    const sim = restored();
    addFinished(sim, 'shrine', sim.seed.x + 20, sim.seed.z, level);
    return incomeOf(sim);
  };
  const [l1, l3] = [at(1), at(3)];
  assert.ok(Math.abs(l1 - none - E.SHRINE.FAITH_PER_LEVEL) < 1e-9, `${none} then ${l1}`);
  assert.ok(Math.abs(l3 - none - 3 * E.SHRINE.FAITH_PER_LEVEL) < 1e-9);
});

await check('the faith multiplier works in the hamlet and in the sandbox village', () => {
  const faithMul = { ...neutralModifiers(), faithMul: 1.25 };
  const hamlet = (modifiers?: typeof faithMul) => incomeOf(grown.restore({ modifiers }));
  const base = hamlet();
  assert.ok(base > 0, 'a converted hamlet earns from its believers');
  assert.ok(Math.abs(hamlet(faithMul) - base * 1.25) < 1e-9, 'hamlet');
  const sandbox = (modifiers?: typeof faithMul) => incomeOf(makeSim(map, { modifiers }));
  assert.equal(sandbox(), VILLAGE.FAITH.BASE_PER_SEC);
  assert.ok(Math.abs(sandbox(faithMul) - VILLAGE.FAITH.BASE_PER_SEC * 1.25) < 1e-9, 'sandbox');
});

finish('all building-effect checks passed');
