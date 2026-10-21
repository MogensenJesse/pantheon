// scripts/checks/village/economy-check.ts — headless checks of wood and food: the pure rules, and what the
// stocks do in a real village (production, eating, storage, the wood and housing gates on growth).
// Run: node --experimental-strip-types scripts/checks/village/economy-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { Role } from '../../../src/world/village/model/types.ts';
import {
  CHEAPEST_WOOD_COST,
  capsOf,
  createEconomy,
  foodPerDay,
  freeBedShare,
  housingOf,
  MEAL_FOOD,
  maxOpenSites,
  pressureAllowsSite,
  shortages,
  stockProblem,
  woodCostOf,
} from '../../../src/world/village/sim/economy.ts';
import { yieldOf } from '../../../src/world/village/sim/forest.ts';
import { type VillageSim, villageStateProblem } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  countRole,
  hoursSim,
  type LoadedMap,
  loadMap,
  makeSim,
} from '../lib/villageHeadless.ts';

const E = VILLAGE.ECONOMY;
const map = loadMap('island-mountain');

/** A hamlet whose people all believe, converted: it grows. */
const convertedHamlet = (m: LoadedMap = map): VillageSim =>
  convertVillage(makeSim(m, { mode: 'hamlet' }));

// --- the pure rules ---

await check(
  'storage: a base for each stock, a finished granary adds food room, a workshop wood room',
  () => {
    const hamlet = makeSim(map, { mode: 'hamlet' });
    const base = { ...capsOf(hamlet.buildings) };
    assert.deepEqual(base, { wood: E.BASE_CAP, food: E.BASE_CAP });
    const granary = { ...hamlet.buildings[0]!, type: 'granary' as const, stage: 2 as const };
    const workshop = { ...granary, type: 'workshop' as const };
    const site = { ...granary, stage: 1 as const };
    assert.deepEqual(capsOf([granary]), {
      wood: E.BASE_CAP,
      food: E.BASE_CAP + E.GRANARY_FOOD_CAP,
    });
    assert.deepEqual(capsOf([workshop]), {
      wood: E.BASE_CAP + E.WORKSHOP_WOOD_CAP,
      food: E.BASE_CAP,
    });
    assert.deepEqual(capsOf([site]), base, 'a granary still being built holds nothing');
    assert.deepEqual(capsOf([granary, granary, workshop]), {
      wood: E.BASE_CAP + E.WORKSHOP_WOOD_CAP,
      food: E.BASE_CAP + 2 * E.GRANARY_FOOD_CAP,
    });
  },
);

await check(
  'the larder: adds stop at the cap, spending needs the wood, a day of meals costs a day',
  () => {
    const e = createEconomy({ wood: 30, food: 24 });
    e.update([]); // sets the caps from no buildings: the base
    assert.equal(e.addWood(100), E.BASE_CAP - 30);
    assert.equal(e.stock.wood, E.BASE_CAP);
    assert.equal(e.addWood(5), 0, 'full');
    assert.equal(e.addFood(-5), 0, 'nothing negative is added');
    assert.equal(e.spendWood(E.BASE_CAP + 1), false);
    assert.equal(e.stock.wood, E.BASE_CAP, 'a refused spend takes nothing');
    assert.equal(e.spendWood(15), true);
    assert.equal(e.stock.wood, E.BASE_CAP - 15);
    const food0 = e.stock.food;
    e.update([]);
    assert.equal(e.stock.food, food0, 'time alone eats nothing: food leaves at the table');
    for (let meal = 0; meal < 24; meal++) assert.equal(e.eat(1 + (meal % 2)), true); // twelve people, two meals each
    assert.ok(
      Math.abs(food0 - e.stock.food - foodPerDay(12)) < 1e-9,
      `${food0} -> ${e.stock.food}`,
    );
    assert.equal(e.canFeed(12), true, 'exactly a day left for twelve');
    assert.equal(e.canFeed(13), false, 'not a day for thirteen');
    while (e.stock.food >= MEAL_FOOD) assert.equal(e.eat(1), true);
    assert.equal(e.hungry, false, 'every meal so far was served');
    assert.equal(e.stock.food, 0, 'the larder is bare');
    assert.equal(e.eat(1), false, 'the larder is empty');
    assert.equal(e.stock.food, 0, 'food never goes below zero');
    assert.equal(e.hungry, true, 'a short meal makes the round a hungry one');
    e.addFood(5);
    e.update([]);
    assert.equal(e.hungry, true, 'food alone does not end it: the next round of meals does');
    assert.equal(e.eat(1), true, 'the same round is still hungry');
    assert.equal(e.hungry, true);
    assert.equal(e.eat(2), true);
    assert.equal(e.hungry, false, 'the next round, all served so far, starts clean');
    e.drainFood();
    assert.equal(e.hungry, true, 'an emptied larder is hunger at once');
    const half = createEconomy({ wood: 0, food: MEAL_FOOD / 2 });
    assert.equal(half.eat(1), false, 'half a portion is not a meal');
    assert.equal(half.stock.food, 0, 'but it is eaten');
    const copy = createEconomy(e.serialize());
    assert.deepEqual(copy.serialize(), e.serialize());
    assert.equal(copy.hungry, e.hungry);
  },
);

await check(
  'housing pressure: sites start only when the beds run short, and more may be open when they nearly have',
  () => {
    const h = (built: number, planned: number, population: number) => ({
      built,
      planned,
      population,
    });
    const beds = 100;
    const free = (share: number) => Math.round(beds * share);
    const P = E.PRESSURE_SHARE;
    assert.equal(freeBedShare(h(beds, 0, beds - free(0.5))), 0.5);
    assert.equal(pressureAllowsSite(h(beds, 0, beds - free(0.5))), false, 'half the beds are free');
    assert.equal(pressureAllowsSite(h(beds, 0, beds - free(P) - 1)), false, 'not short enough');
    assert.equal(pressureAllowsSite(h(beds, 0, beds - free(P) + 1)), true);
    assert.equal(
      pressureAllowsSite(h(beds / 2, beds / 2, beds - free(P) + 1)),
      true,
      'beds in sites count',
    );
    assert.equal(
      pressureAllowsSite(h(beds / 2, beds / 2, beds / 2)),
      false,
      '...so a site already under way relieves the pressure',
    );
    assert.equal(
      maxOpenSites(h(beds, 0, beds - free(E.PRESSED_SHARE) + 1), 3),
      E.PRESSED_MAX_SITES,
    );
    assert.equal(maxOpenSites(h(beds, 0, beds - free(P) + 1), 3), 3);
    assert.equal(freeBedShare(h(0, 0, 0)), 0);
    const hamlet = makeSim(map, { mode: 'hamlet' });
    const housing = housingOf(hamlet.buildings, hamlet.villagers.count);
    assert.equal(housing.built, hamlet.stats().beds);
    assert.equal(housing.planned, 0);
  },
);

await check('shortages: less than a day of food, less wood than the cheapest building', () => {
  assert.deepEqual(shortages({ wood: 50, food: 11 }, 12), { food: true, wood: false });
  assert.deepEqual(shortages({ wood: CHEAPEST_WOOD_COST - 1, food: 99 }, 12), {
    food: false,
    wood: true,
  });
  assert.deepEqual(shortages({ wood: CHEAPEST_WOOD_COST, food: 12 }, 12), {
    food: false,
    wood: false,
  });
});

await check('a saved stock is checked: missing, negative and not-a-number are refused', () => {
  assert.equal(stockProblem({ wood: 1, food: 2, round: 0, missed: false }), null);
  for (const bad of [
    undefined,
    null,
    {},
    { wood: 1 },
    { wood: -1, food: 2 },
    { wood: 1, food: Number.NaN, round: 0, missed: false },
    { wood: 1, food: 2 },
    { wood: 1, food: 2, round: 3, missed: false },
    { wood: 1, food: 2, round: 0, missed: 'no' },
  ]) {
    assert.ok(stockProblem(bad), JSON.stringify(bad));
  }
  const state = makeSim(map, { mode: 'hamlet' }).serialize();
  assert.equal(villageStateProblem(state, makeSim(map).seed), null);
  assert.ok(villageStateProblem({ ...state, economy: undefined as never }, makeSim(map).seed));
  assert.ok(
    villageStateProblem(
      { ...state, economy: { wood: -3, food: 1, round: 0, missed: false } },
      makeSim(map).seed,
    ),
  );
  // The rest of the state is checked too, with a reason the player can be told.
  const seed = makeSim(map).seed;
  const bad: Record<string, unknown> = {
    faith: { ...state.faith, rate: Number.NaN },
    rng: { ...state.rng, plan: [1, 2, 3] },
    agents: { ...state.agents, pathQueue: [0.5] },
  };
  for (const [key, value] of Object.entries(bad)) {
    assert.match(villageStateProblem({ ...state, [key]: value }, seed) ?? '', /saved village/, key);
  }
});

// --- in a real village ---

await check('production: an unconverted hamlet adds to its food and wood stores', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  assert.deepEqual({ ...sim.economy.stock }, E.START);
  assert.ok(countRole(sim, Role.Woodcutter) > 0 && countRole(sim, Role.Farmer) > 0);
  hoursSim(sim, 0.5);
  const s = sim.stats();
  assert.ok(s.wood > E.START.wood, `wood ${s.wood} of ${s.woodCap}`);
  assert.ok(s.food > E.START.food, `food ${s.food} of ${s.foodCap}`);
});

await check(
  'the baseline: food never goes below zero, the stores never pass their caps, and every site paid its wood',
  () => {
    const sim = convertedHamlet();
    let spent = 0;
    let yielded = 0;
    let lastSum = sim.economy.stock.wood;
    let started = 0;
    hoursSim(sim, 1, (_t, events) => {
      for (const e of events) {
        if (e.kind === 'treeFelled') yielded += yieldOf(sim.forest.info(e.tree));
        if (e.kind === 'siteStarted') {
          spent += woodCostOf(e.building.type);
          started++;
        }
      }
      const { stock } = sim.economy;
      const caps = sim.economy.caps();
      assert.ok(stock.food >= 0 && stock.wood >= 0, 'stocks never go negative');
      assert.ok(
        stock.food <= caps.food + 1e-9 && stock.wood <= caps.wood + 1e-9,
        'never over the cap',
      );
      // stock + spent never shrinks, and only grows by the yield of the trees woodcutters felled: a
      // site started without paying (or wood from nowhere) would break the upper bound.
      const sum = stock.wood + spent;
      assert.ok(sum - lastSum >= -1e-9, `wood vanished (${sum - lastSum})`);
      assert.ok(
        sum <= E.START.wood + yielded + 1e-6,
        `wood from nowhere (${sum} > ${E.START.wood} + ${yielded})`,
      );
      lastSum = sum;
    });
    assert.ok(started > 0, 'no site started');
  },
);

await check(
  'growth is paced by housing: every site starts while the free beds are short, never more than the cap open',
  () => {
    const sim = makeSim(map, { mode: 'sandbox' });
    let starts = 0;
    let share = freeBedShare(housingOf(sim.buildings, sim.villagers.count));
    hoursSim(sim, 1, (_t, events) => {
      for (const e of events) {
        if (e.kind !== 'siteStarted') continue;
        starts++;
        assert.ok(
          share < E.PRESSURE_SHARE,
          `a site started with ${(share * 100).toFixed(0)}% of the beds free`,
        );
      }
      const open = sim.buildings.filter((b) => b.stage < 2).length;
      const pressed = freeBedShare(housingOf(sim.buildings, sim.villagers.count)) < E.PRESSED_SHARE;
      assert.ok(
        open <= (pressed ? E.PRESSED_MAX_SITES : VILLAGE.PLAN.MAX_ACTIVE_SITES),
        `${open} sites open`,
      );
      share = freeBedShare(housingOf(sim.buildings, sim.villagers.count));
    });
    assert.ok(starts > 0, 'the village grew');
  },
);

await check('newcomers need a day of food in the larder for everyone', () => {
  const sim = convertedHamlet();
  let arrivals = 0;
  let people = sim.villagers.count;
  hoursSim(sim, 1, () => {
    if (sim.villagers.count > people) {
      arrivals += sim.villagers.count - people;
      assert.ok(
        sim.economy.stock.food >= sim.villagers.count - 1e-9,
        `food ${sim.economy.stock.food.toFixed(1)} for ${sim.villagers.count} people`,
      );
    }
    people = sim.villagers.count;
  });
  assert.ok(arrivals > 0, 'the village took in newcomers');
});

await check('a village with no food in the larder takes in nobody', () => {
  const sim = convertedHamlet();
  sim.economy.drainFood();
  assert.equal(sim.economy.stock.food, 0);
  const before = sim.villagers.count;
  hoursSim(sim, 0.02); // 72 s: faith is plentiful but the larder has less than a day
  assert.equal(sim.villagers.count, before);
});

await check(
  'wood-starved: no site starts with no wood and nobody to cut it; a delivery restarts growth',
  () => {
    const treeless: LoadedMap = { ...map, trees: [] };
    const sim = convertedHamlet(treeless);
    assert.equal(countRole(sim, Role.Woodcutter), 0, 'no trees, no woodcutters');
    sim.economy.spendWood(sim.economy.stock.wood);
    const sitesOf = (s: VillageSim) =>
      s.buildings.filter((b) => b.type !== 'temple' && b.type !== 'well').length;
    const before = sitesOf(sim);
    const people = sim.villagers.count;
    let started = 0;
    hoursSim(sim, 1, (_t, events) => {
      started += events.filter((e) => e.kind === 'siteStarted').length;
    });
    assert.equal(started, 0, 'nothing was started without wood');
    assert.equal(sitesOf(sim), before);
    assert.ok(
      sim.villagers.count > people,
      'people still arrive; the beds fill and the pressure builds',
    );
    sim.economy.addWood(E.BASE_CAP);
    sim.addFaith(500);
    hoursSim(sim, 0.5, (_t, events) => {
      started += events.filter((e) => e.kind === 'siteStarted').length;
    });
    assert.ok(started > 0, 'addWood restarted growth');
  },
);

await check(
  'the same start gives the same village; a save in the middle continues identically',
  () => {
    const a = convertedHamlet();
    const b = convertedHamlet();
    hoursSim(a, 0.3);
    hoursSim(b, 0.3);
    assert.deepEqual(b.serialize(), a.serialize());
    const resumed = makeSim(map, { mode: 'hamlet', restore: structuredClone(a.serialize()) });
    hoursSim(a, 0.1);
    hoursSim(resumed, 0.1);
    assert.deepEqual(resumed.serialize(), a.serialize());
  },
);

finish('all economy checks passed');
