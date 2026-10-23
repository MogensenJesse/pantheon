// scripts/checks/village/upgrades-check.ts — headless checks of the arch II skills in the village: each node's
// effect on the sim, and the forest rule the workshop will feed.
// Run: node --experimental-strip-types scripts/checks/village/upgrades-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { type Modifiers, neutralModifiers } from '../../../src/skills/modifiers.ts';
import type { VillageEvent } from '../../../src/world/village/model/types.ts';
import { capsOf, housingOf } from '../../../src/world/village/sim/economy.ts';
import { createForest, TreeState } from '../../../src/world/village/sim/forest.ts';
import {
  createHungerState,
  deathsAtS,
  stageOf,
  stepHunger,
  weakAtS,
} from '../../../src/world/village/sim/hunger.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  dayPhaseAt,
  loadMap,
  makeSim,
  simulate,
  stepSim,
  withConfig,
} from '../lib/villageHeadless.ts';

const map = loadMap('island-mountain');
const mods = (over: Partial<Modifiers>): Modifiers => ({ ...neutralModifiers(), ...over });

const run = (
  sim: VillageSim,
  seconds: number,
  from = 0,
  opts: { rain?: number; onStep?: (t: number) => void } = {},
): VillageEvent[] => stepSim(sim, { seconds, from, ...opts });

function hamlet(m: Modifiers = neutralModifiers(), converted = false): VillageSim {
  const sim = makeSim(map, { mode: 'hamlet', modifiers: m });
  return converted ? convertVillage(sim) : sim;
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

await check('Granary: both stores hold the storage modifier more', () => {
  const a = hamlet();
  const b = hamlet(mods({ storageCapAdd: 40 }));
  a.economy.update(a.buildings);
  b.economy.update(b.buildings);
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
  // the same fields under the same walking: the ratio to the dry run is the rain boost
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
    assert.ok(plain.fish > 0, 'the plain village fished');
    assert.ok(Math.abs(tide.fish / plain.fish - 1.5) < 0.05, `x${tide.fish / plain.fish}`);
  },
);

await check('Quick hands: builders put in work at the modifier rate', () => {
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

await check('Town: the building cap rises with the modifier', () => {
  const cap = 10;
  withConfig(VILLAGE.PLAN, { MAX_BUILDINGS: cap }, () => {
    const count = (m: Modifiers) => {
      const sim = makeSim(map, { modifiers: m });
      simulate(sim, { hours: 1, phase: dayPhaseAt, vigil: false, presence: true, fed: true });
      return sim.buildings.length;
    };
    const plain = count(neutralModifiers());
    const town = count(mods({ buildingCapMul: 1.4 }));
    assert.ok(plain <= cap, `${plain}`);
    assert.ok(town > plain && town <= Math.floor(cap * 1.4), `${town} vs ${plain}`);
  });
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

await check('Gravekeeper: a death costs the faith scaled by the modifier', () => {
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
  'the forest rule treeBoost: a boosted tree is chopped faster and a boosted sapling grows sooner',
  () => {
    // The workshop's level feeds this rule (buildingEffects); here it is just a number.
    const BOOST = 1.5;
    const trees = [{ x: 0, z: 0, key: 'fir_01', scale: 1 }];
    const ev: VillageEvent[] = [];
    const seconds = (boost: number) => {
      const f = createForest(trees, { treeBoost: () => boost });
      let s = 0;
      while (f.chop(0, 1, 1, 0, ev) === 0) s++;
      return s + 1;
    };
    const plain = seconds(1);
    const boosted = seconds(BOOST);
    assert.ok(Math.abs(plain / boosted - BOOST) < 0.05, `${plain} vs ${boosted}`);
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
    assert.ok(grow(BOOST) < grow(1), 'a boosted sapling grows back sooner');
  },
);

finish('all upgrade checks passed');
