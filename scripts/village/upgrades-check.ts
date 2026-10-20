// scripts/village/upgrades-check.ts — headless checks of the arch II skills in the village (M9): each node's
// effect on the sim, and the three builder powers that act on it (Blessing, Kindle, Provide).
// Run: node --experimental-strip-types scripts/village/upgrades-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../src/config/village.ts';
import { type Modifiers, neutralModifiers } from '../../src/skills/modifiers.ts';
import { Role, type VillageEvent } from '../../src/world/village/model/types.ts';
import { remainingWork } from '../../src/world/village/sim/construction.ts';
import { capsOf, housingOf } from '../../src/world/village/sim/economy.ts';
import { createForest, TreeState } from '../../src/world/village/sim/forest.ts';
import {
  createHungerState,
  deathsAtS,
  stageOf,
  stepHunger,
  weakAtS,
} from '../../src/world/village/sim/hunger.ts';
import type { VillageSim } from '../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { DAY_S, loadMap, makeSim } from '../lib/villageHeadless.ts';

const DT = 0.1;
const DAY = (t: number) => (0.3 + t / DAY_S) % 1;
const map = loadMap('island-mountain');
const mods = (over: Partial<Modifiers>): Modifiers => ({ ...neutralModifiers(), ...over });
const POWERS = VILLAGE.BUILDER_POWERS;

function run(
  sim: VillageSim,
  seconds: number,
  from = 0,
  opts: { rain?: number; onStep?: (t: number) => void } = {},
): VillageEvent[] {
  const log: VillageEvent[] = [];
  const events: VillageEvent[] = [];
  const first = Math.round(from / DT);
  const steps = Math.round(seconds / DT);
  for (let k = first; k < first + steps; k++) {
    sim.beginStep();
    sim.update(
      DT,
      {
        playerDistM: 10,
        presenceActive: true,
        dayPhase: DAY(k * DT),
        vigil: false,
        rain01: opts.rain ?? 0,
      },
      events,
    );
    for (const e of events) log.push(e);
    events.length = 0;
    opts.onStep?.(k * DT);
  }
  return log;
}

function hamlet(m: Modifiers = neutralModifiers(), converted = false): VillageSim {
  const sim = makeSim(map, { mode: 'hamlet', modifiers: m });
  if (converted) {
    const events: VillageEvent[] = [];
    for (let i = 0; i < sim.villagers.count; i++) sim.addBelief(i, 1, events);
    sim.convertVillage(events);
  }
  return sim;
}

// --- the numbers, one node at a time ---

await check('Wider beds: every finished house has a bed more, and the housing count agrees', () => {
  const a = hamlet();
  const b = hamlet(mods({ bedsPerHouseAdd: 1 }));
  const houses = a.buildings.filter((x) => x.type.startsWith('house_') && x.stage >= 2).length;
  assert.ok(houses >= 3);
  assert.equal(b.stats().beds, a.stats().beds + houses);
  const h0 = housingOf(a.buildings, 11);
  const h1 = housingOf(a.buildings, 11, 1);
  assert.equal(h1.built, h0.built + houses);
});

await check('Granary: both stores hold forty more', () => {
  const a = hamlet();
  const b = hamlet(mods({ storageCapAdd: 40 }));
  a.economy.update(0, a.buildings);
  b.economy.update(0, b.buildings);
  assert.equal(b.economy.caps().food, a.economy.caps().food + 40);
  assert.equal(b.economy.caps().wood, a.economy.caps().wood + 40);
  assert.equal(capsOf([], undefined, 40).food, VILLAGE.ECONOMY.BASE_CAP + 40);
});

await check('Sharp axes: a felled tree gives a log more, and takes no longer to chop', () => {
  const trees = [{ x: 0, z: 0, key: 'fir_01', scale: 1 }];
  const plain = createForest(trees);
  const axes = createForest(trees, { woodAdd: () => 1 });
  const ev: VillageEvent[] = [];
  const plainWood = plain.fell(0, 1, 0, ev);
  assert.equal(axes.fell(0, 1, 0, ev), plainWood + 1);
  // chopping: the same seconds
  const a = createForest(trees);
  const b = createForest(trees, { woodAdd: () => 1 });
  let sa = 0;
  let sb = 0;
  while (a.chop(0, 1, 1, 0, ev) === 0) sa++;
  while (b.chop(0, 1, 1, 0, ev) === 0) sb++;
  assert.equal(sa, sb);
});

await check('Seedkeeper and Evergreen: stumps wait less, and in rain not at all', () => {
  const F = VILLAGE.FOREST;
  const trees = [{ x: 0, z: 0, key: 'fir_01', scale: 1 }];
  const free = { rain01: 0, canRegrow: () => true };
  const wait = (rules: Parameters<typeof createForest>[1], rain = 0) => {
    const f = createForest(trees, rules);
    const ev: VillageEvent[] = [];
    f.fell(0, 1, 0, ev);
    let s = 0;
    while (f.state(0) !== TreeState.Sapling && s < 10 * DAY_S) {
      f.update(1, { ...free, rain01: rain }, ev);
      s++;
    }
    return s;
  };
  const plain = wait({});
  assert.ok(Math.abs(plain - (F.REGROW_DAYS * DAY_S + F.FALL_S)) < 3, `${plain} s`);
  const seed = wait({ stumpWaitMul: () => 2 / 3 });
  assert.ok(Math.abs(seed - ((F.REGROW_DAYS * DAY_S * 2) / 3 + F.FALL_S)) < 3, `${seed} s`);
  const dryEvergreen = wait({ evergreen: () => true }, 0);
  assert.ok(Math.abs(dryEvergreen - plain) < 3, 'Evergreen does nothing in dry weather');
  const wetEvergreen = wait({ evergreen: () => true }, 0.8);
  assert.ok(wetEvergreen < F.FALL_S + 3, `${wetEvergreen} s`);
  const drizzle = wait({ evergreen: () => true }, 0.1);
  assert.ok(Math.abs(drizzle - plain) < 3, 'a drizzle is not rain enough');
});

await check('Rain-reader and Downpour: rain does fields and saplings more good', () => {
  const growth = (m: Modifiers, rain: number) => {
    const sim = hamlet(m);
    run(sim, 20, 0, { rain });
    return sim.fields.map((f) => f.growth);
  };
  // asleep for the first 20 s of the phase 0.3? no: phase 0.3 is work time, so use the growth ratio of
  // the same fields under the same walking: farmers are the same people at the same places
  const dry = growth(neutralModifiers(), 0);
  const plain = growth(neutralModifiers(), 1);
  const reader = growth(mods({ rainBoostAdd: 0.15 }), 1);
  const down = growth(mods({ rainBoostMul: 2 }), 1);
  const both = growth(mods({ rainBoostAdd: 0.15, rainBoostMul: 2 }), 1);
  const base = VILLAGE.FIELDS.RAIN_BOOST;
  dry.forEach((g, k) => {
    const rel = (x: number) => x / g;
    assert.ok(Math.abs(rel(plain[k]!) - (1 + base)) < 0.02, `x${rel(plain[k]!)}`);
    assert.ok(Math.abs(rel(reader[k]!) - (1 + base + 0.15)) < 0.02);
    assert.ok(Math.abs(rel(down[k]!) - (1 + base * 2)) < 0.02);
    assert.ok(Math.abs(rel(both[k]!) - (1 + (base + 0.15) * 2)) < 0.02);
  });
});

await check(
  'Good soil and Tide-caller: harvests bring a unit more, the fishermen half as much again',
  () => {
    const harvests = (m: Modifiers) => {
      const sim = hamlet(m);
      const amounts: number[] = [];
      let fish = 0;
      const real = sim.economy.addFood;
      sim.economy.addFood = (amount: number) => {
        if (amount >= 1) amounts.push(amount);
        else fish += amount;
        return real(amount);
      };
      run(sim, DAY_S * 0.9);
      return { amounts, fish };
    };
    const plain = harvests(neutralModifiers());
    const soil = harvests(mods({ fieldYieldAdd: 1 }));
    assert.ok(plain.amounts.length > 0, 'the plain village harvested');
    assert.ok(plain.amounts.every((a) => a === VILLAGE.ECONOMY.FIELD_YIELD));
    assert.ok(soil.amounts.every((a) => a === VILLAGE.ECONOMY.FIELD_YIELD + 1));
    const tide = harvests(mods({ fishMul: 1.5 }));
    if (plain.fish > 0) {
      assert.ok(Math.abs(tide.fish / plain.fish - 1.5) < 0.05, `x${tide.fish / plain.fish}`);
    }
  },
);

await check('Quick hands: builders build a quarter faster', () => {
  const W = VILLAGE.CONSTRUCTION.WORK_S;
  const total = (m: Modifiers) => {
    const sim = hamlet(m, true);
    sim.economy.addWood(Number.POSITIVE_INFINITY);
    sim.addFaith(500);
    const before = new Set(sim.buildings.map((b) => b.id));
    sim.startSiteNow([]);
    run(sim, 240);
    // builder-seconds put into the sites started now: finished stages plus the progress in the open one
    let work = 0;
    for (const b of sim.buildings) {
      if (before.has(b.id)) continue;
      for (let stage = 0; stage < Math.min(b.stage, 2); stage++) work += W[stage]!;
      if (b.stage < 2) work += b.progress;
    }
    return work;
  };
  const plain = total(neutralModifiers());
  const quick = total(mods({ builderRateMul: 1.25 }));
  assert.ok(plain > 0, 'the builders got to work');
  assert.ok(quick / plain > 1.1 && quick / plain < 1.4, `x${(quick / plain).toFixed(2)}`);
});

await check('Town: the village may have 40% more buildings', () => {
  const P = VILLAGE.PLAN as { MAX_BUILDINGS: number };
  const saved = P.MAX_BUILDINGS;
  P.MAX_BUILDINGS = 12;
  try {
    const count = (m: Modifiers) => {
      const sim = makeSim(map, { modifiers: m });
      for (let k = 0; k < Math.round((3 * 3600) / DT); k++) {
        sim.economy.addWood(Number.POSITIVE_INFINITY);
        sim.economy.addFood(Number.POSITIVE_INFINITY);
        sim.beginStep();
        sim.update(
          DT,
          { playerDistM: 10, presenceActive: true, dayPhase: DAY(k * DT), vigil: false },
          [],
        );
      }
      return sim.buildings.length;
    };
    const plain = count(neutralModifiers());
    const town = count(mods({ buildingCapMul: 1.4 }));
    assert.ok(plain <= 12, `${plain}`);
    assert.ok(town > plain && town <= 16, `${town} vs ${plain}`);
  } finally {
    P.MAX_BUILDINGS = saved;
  }
});

await check('Lean winters: three times the days of grace before people weaken and die', () => {
  const day = (grace: number) => {
    const s = createHungerState();
    let weak = -1;
    let death = -1;
    for (let t = 0; t < 12 * DAY_S && death < 0; t++) {
      const died = stepHunger(s, 1, true, grace);
      if (weak < 0 && stageOf(s, true, grace) === 'weak') weak = t / DAY_S;
      if (died) death = t / DAY_S;
    }
    return { weak, death };
  };
  const plain = day(1);
  const lean = day(3);
  assert.ok(Math.abs(plain.weak - VILLAGE.HUNGER.STARVE_GRACE_DAYS) < 0.01);
  assert.ok(Math.abs(lean.weak - 3 * VILLAGE.HUNGER.STARVE_GRACE_DAYS) < 0.01, `${lean.weak}`);
  assert.ok(Math.abs(lean.death - (plain.death + 2 * VILLAGE.HUNGER.STARVE_GRACE_DAYS)) < 0.01);
  assert.ok(deathsAtS(3) > deathsAtS(1) && weakAtS(3) === 3 * weakAtS(1));
  // lowering the grace (a respec) with a build-up above the new ceiling does not break the state
  const high = { level: deathsAtS(3), sinceDeath: 0 };
  stepHunger(high, 1, true, 1);
  assert.ok(high.level <= deathsAtS(1));
});

await check('Gravekeeper: a death costs half the faith', () => {
  const cost = (m: Modifiers) => {
    const sim = hamlet(m, true);
    sim.addFaith(500);
    const before = sim.faith.faith;
    sim.killOne([]);
    return before - sim.faith.faith;
  };
  const plain = cost(neutralModifiers());
  assert.equal(plain, VILLAGE.HUNGER.DEATH_FAITH_COST);
  assert.equal(cost(mods({ deathFaithMul: 0.5 })), plain / 2);
});

// --- the powers on the village ---

await check(
  'Blessing: a field grows faster, a house works faster, a tree is chopped faster, then it ends',
  () => {
    const B = POWERS.BLESSING;
    const sim = hamlet(neutralModifiers(), true);
    const field = sim.fields[0]!;
    const house = sim.buildings.find((b) => b.type.startsWith('house_') && b.stage >= 2)!;
    assert.equal(sim.bless('field', field.id, B.SECONDS), true);
    assert.equal(sim.isBlessed('field', field.id), true);
    assert.equal(sim.bless('field', 99999, B.SECONDS), false, 'no such field');
    assert.equal(
      sim.bless('house', sim.buildings[0]!.id, B.SECONDS),
      false,
      'the temple is no house',
    );
    assert.equal(sim.bless('house', house.id, B.SECONDS), true);
    assert.equal(sim.bless('tree', 0, B.SECONDS), true);
    assert.equal(sim.bless('tree', -1, B.SECONDS), false);
    assert.equal(sim.blessings.length, 3);
    // growth: compare with an unblessed twin
    const twin = hamlet(neutralModifiers(), true);
    field.growth = 0;
    twin.fields[0]!.growth = 0;
    run(sim, 5, DAY_S * 0.1);
    run(twin, 5, DAY_S * 0.1);
    assert.ok(
      Math.abs(field.growth / twin.fields[0]!.growth - B.BOOST) < 0.1,
      `x${field.growth / twin.fields[0]!.growth}`,
    );
    // time runs it out; renewing keeps the longer
    const run2 = hamlet(neutralModifiers(), true);
    run2.bless('field', run2.fields[0]!.id, 10);
    run2.bless('field', run2.fields[0]!.id, 4);
    assert.equal(run2.blessings[0]!.left, 10, 'a shorter blessing does not cut a longer one');
    run(run2, 11);
    assert.equal(run2.blessings.length, 0);
    assert.equal(run2.isBlessed('field', run2.fields[0]!.id), false);
  },
);

await check('Blessing: a blessed tree falls to the axe in two thirds of the time', () => {
  const trees = [{ x: 0, z: 0, key: 'fir_01', scale: 1 }];
  const ev: VillageEvent[] = [];
  const seconds = (boost: number) => {
    const f = createForest(trees, { treeBoost: () => boost });
    let s = 0;
    while (f.chop(0, 1, 1, 0, ev) === 0) s++;
    return s + 1;
  };
  const plain = seconds(1);
  const blessed = seconds(POWERS.BLESSING.BOOST);
  assert.ok(Math.abs(plain / blessed - POWERS.BLESSING.BOOST) < 0.05, `${plain} vs ${blessed}`);
  // and a sapling grows faster
  const grow = (boost: number) => {
    const f = createForest(trees, { treeBoost: () => boost });
    f.fell(0, 1, 0, ev);
    let s = 0;
    const free = { rain01: 0, canRegrow: () => true };
    while (f.state(0) !== TreeState.Standing && s < 20 * DAY_S) {
      f.update(1, free, ev);
      s++;
    }
    return s;
  };
  assert.ok(grow(1.5) < grow(1), 'a blessed sapling grows back sooner');
});

await check('Blessing a house: its builders build faster', () => {
  const work = (blessed: boolean) => {
    const sim = hamlet(neutralModifiers(), true);
    sim.economy.addWood(Number.POSITIVE_INFINITY);
    sim.addFaith(500);
    if (blessed) {
      for (const b of sim.buildings) {
        if (b.type.startsWith('house_') && b.stage >= 2) sim.bless('house', b.id, 5000);
      }
    }
    const events: VillageEvent[] = [];
    sim.startSiteNow(events);
    run(sim, 500);
    return sim.buildings.reduce((sum, b) => sum + b.stage * 1000 + b.progress, 0);
  };
  assert.ok(work(true) > work(false), 'blessed builders got more done');
});

await check(
  'Kindle finishes the current stage of a site at once, and refuses anything else',
  () => {
    const sim = hamlet(neutralModifiers(), true);
    sim.economy.addWood(Number.POSITIVE_INFINITY);
    sim.addFaith(500);
    const events: VillageEvent[] = [];
    assert.equal(sim.startSiteNow(events), true);
    const site = sim.buildings.find((b) => b.stage < 2)!;
    assert.ok(remainingWork(site) > 0);
    const stage = site.stage;
    const out: VillageEvent[] = [];
    assert.equal(sim.kindle(site.id, out), true);
    assert.equal(site.stage, stage + 1, 'one stage further');
    assert.ok(out.some((e) => e.kind === 'stageCompleted'));
    assert.equal(sim.kindle(sim.buildings[0]!.id, []), false, 'a finished building is not a site');
    assert.equal(sim.kindle(99999, []), false);
    // twice more finishes it
    sim.kindle(site.id, []);
    if (site.stage < 2) sim.kindle(site.id, []);
    assert.equal(site.stage, 2);
    assert.equal(remainingWork(site), 0);
  },
);

await check('Provide puts food in the larder, and says no when it is full', () => {
  const sim = hamlet();
  sim.economy.update(0, sim.buildings);
  sim.economy.drainFood();
  assert.equal(sim.provide(POWERS.PROVIDE.FOOD), true);
  assert.equal(sim.economy.stock.food, POWERS.PROVIDE.FOOD);
  sim.economy.addFood(Number.POSITIVE_INFINITY);
  assert.equal(sim.provide(POWERS.PROVIDE.FOOD), false, 'no room');
  assert.equal(Role.Priest >= 0, true);
});

await check(
  'blessings are saved and continue exactly: a save and the run that went on agree',
  () => {
    const a = hamlet(neutralModifiers(), true);
    a.bless('field', a.fields[0]!.id, 100);
    a.bless('tree', 3, 50);
    run(a, 20);
    const saved = structuredClone(a.serialize());
    assert.equal(saved.blessings.length, 2);
    const b = makeSim(map, { mode: 'hamlet', restore: saved });
    assert.deepEqual(b.blessings, a.blessings);
    run(a, 60, 20);
    run(b, 60, 20);
    assert.deepEqual(b.serialize(), a.serialize());
    assert.equal(a.blessings.length, 1, 'the shorter one ran out');
  },
);

finish('all upgrade checks passed');
