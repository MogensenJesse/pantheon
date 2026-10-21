// scripts/checks/village/routine-check.ts — headless checks of the villagers' day: meals at midday and in the
// evening, where the food leaves the larder, shelter from rain, priests mourning at the graves, idlers on the
// plaza. The pure timetable first, then a real hamlet.
// Run: node --experimental-strip-types scripts/checks/village/routine-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { Activity, Mode, Role, type VillageEvent } from '../../../src/world/village/model/types.ts';
import { MEAL_FOOD } from '../../../src/world/village/sim/economy.ts';
import {
  clearedDone,
  Done,
  mealAt,
  mealRoundAt,
  scheduledActivity,
} from '../../../src/world/village/sim/routine.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  DT,
  loadMap,
  makeSim,
  stepSim,
  withNoFood,
} from '../lib/villageHeadless.ts';

const V = VILLAGE.VILLAGERS;
const S = V.SCHEDULE;
const NONE = { shelter: false, mourning: false };
const who = (role: number, over: Partial<{ piety: number; done: number }> = {}) => ({
  role,
  piety: 0.9,
  nightOwl: 0,
  offset: 0,
  done: 0,
  ...over,
});

// --- the pure timetable ---

await check(
  'meal windows: the two meals, their rounds and the bits that are forgotten after them',
  () => {
    assert.equal(mealAt(0.3), 0);
    assert.equal(mealAt(S.MIDDAY_MEAL[0]), Done.MiddayMeal);
    assert.equal(mealAt(S.MIDDAY_MEAL[1] - 1e-6), Done.MiddayMeal);
    assert.equal(mealAt(S.MIDDAY_MEAL[1]), 0, 'the window is half open');
    assert.equal(mealAt(0.72), Done.EveningMeal);
    assert.equal(
      mealRoundAt(0.51),
      Done.MiddayMeal,
      'a late midday meal is still the midday round',
    );
    assert.equal(mealRoundAt(0.75), Done.EveningMeal);
    const all = Done.MiddayMeal | Done.EveningMeal | Done.Mourned;
    assert.equal(clearedDone(all, 0.3), 0, 'in the morning nothing is done');
    assert.equal(clearedDone(all, 0.47), Done.MiddayMeal, 'inside the midday window only it holds');
    assert.equal(clearedDone(all, 0.72), Done.EveningMeal | Done.Mourned);
  },
);

await check('a working day: work, a meal at midday, work, the evening meal, bed', () => {
  const day = (role: number, phase: number, done = 0, world = NONE) =>
    scheduledActivity(who(role, { done }), phase, false, world);
  assert.equal(day(Role.Farmer, 0.3), Activity.Work);
  assert.equal(day(Role.Farmer, 0.47), Activity.Eat, 'hungry at midday');
  assert.equal(day(Role.Farmer, 0.47, Done.MiddayMeal), Activity.Work, 'fed: back to work');
  assert.equal(day(Role.Farmer, 0.6), Activity.Work);
  assert.equal(day(Role.Builder, 0.47), Activity.Eat);
  assert.equal(day(Role.Priest, 0.47), Activity.Eat, 'priests eat too');
  assert.equal(day(Role.Priest, 0.72), Activity.Eat);
  assert.equal(
    day(Role.Fisherman, 0.72, Done.EveningMeal),
    Activity.Wander,
    'free time after supper',
  );
  assert.equal(day(Role.Farmer, 0.2), Activity.Sleep, 'asleep before the wake-up');
  assert.equal(day(Role.Farmer, 0.9), Activity.Sleep);
  assert.equal(day(Role.Farmer, 0.9, 0), Activity.Sleep, 'no meals at night');
});

await check('rain sends everyone but the priests home, and a meal at home is still a meal', () => {
  const rain = { shelter: true, mourning: false };
  const act = (role: number, phase: number, done = 0) =>
    scheduledActivity(who(role, { done }), phase, false, rain);
  for (const role of [Role.Builder, Role.Farmer, Role.Woodcutter, Role.Fisherman, Role.Idler]) {
    assert.equal(act(role, 0.5 + 0.1), Activity.Shelter, `role ${role} at work in the rain`);
    assert.equal(act(role, 0.47), Activity.Eat, 'the meal comes first');
    assert.equal(act(role, 0.47, Done.MiddayMeal), Activity.Shelter);
  }
  assert.equal(act(Role.Priest, 0.6), Activity.Pray, 'priests stay at the temple');
  assert.equal(act(Role.Farmer, 0.9), Activity.Sleep);
});

await check(
  'dusk: priests mourn when there are graves, then go home; idlers go home; vigil goes on',
  () => {
    const grave = { shelter: false, mourning: true };
    const dusk = 0.69;
    assert.equal(scheduledActivity(who(Role.Priest), dusk, false, grave), Activity.Mourn);
    assert.equal(
      scheduledActivity(who(Role.Priest, { done: Done.Mourned }), dusk, false, grave),
      Activity.Shelter,
    );
    assert.equal(
      scheduledActivity(who(Role.Priest), dusk, false, NONE),
      Activity.Pray,
      'no graves, no mourning',
    );
    assert.equal(
      scheduledActivity(who(Role.Priest), 0.5, false, grave),
      Activity.Pray,
      'only at dusk',
    );
    assert.equal(
      scheduledActivity(who(Role.Idler, { piety: 0.9 }), dusk, false, NONE),
      Activity.Shelter,
    );
    assert.equal(
      scheduledActivity(who(Role.Idler, { piety: 0.1 }), dusk, false, NONE),
      Activity.Pray,
    );
    assert.equal(
      scheduledActivity(who(Role.Farmer, { piety: 0.9 }), dusk, false, NONE),
      Activity.Wander,
    );
    assert.equal(
      scheduledActivity(who(Role.Idler), 0.4, false, NONE),
      Activity.Wander,
      'idlers stroll by day',
    );
    // Phase 0: the night is kept by lantern
    const owl = { ...who(Role.Builder), nightOwl: 1 };
    assert.equal(scheduledActivity(owl, 0.05, true, NONE), Activity.Work);
    assert.equal(
      scheduledActivity({ ...who(Role.Farmer), nightOwl: 2 }, 0.05, true, NONE),
      Activity.Pray,
    );
    assert.equal(scheduledActivity(who(Role.Priest), 0.05, true, NONE), Activity.Pray);
    assert.equal(scheduledActivity(who(Role.Farmer), 0.05, true, NONE), Activity.Sleep);
  },
);

// --- a real hamlet ---

const map = loadMap('island-mountain');
interface Drive {
  /** Day phase to run on (default: the cycle from 0.3). */
  phase?: (t: number) => number;
  rain?: (t: number) => number;
}

/** Run `seconds` of village time from `from`, calling `onStep(t)` after each step. */
const run = (
  sim: VillageSim,
  from: number,
  seconds: number,
  onStep?: (t: number) => void,
  drive: Drive = {},
): VillageEvent[] => stepSim(sim, { from, seconds, onStep, ...drive });

function village(opts: { converted?: boolean } = {}): VillageSim {
  const sim = makeSim(map, { mode: 'hamlet' });
  return opts.converted ? convertVillage(sim) : sim;
}

const idsWhere = (sim: VillageSim, pred: (i: number) => boolean) => {
  const out: number[] = [];
  for (let i = 0; i < sim.villagers.count; i++) if (pred(i)) out.push(i);
  return out;
};

await check(
  'everyone eats twice a day, and the food leaves the larder at the table, one portion each',
  () => {
    withNoFood(() => {
      const sim = village();
      sim.economy.addFood(Number.POSITIVE_INFINITY);
      const people = sim.villagers.count;
      const food0 = sim.economy.stock.food;
      let atMidday = 0;
      const atTable = new Set<number>();
      run(sim, 0, 0.65 * DAY_S, (t) => {
        if (Math.abs(t - 468) < DT / 2) atMidday = sim.stats().mealsServed;
        for (let i = 0; i < sim.villagers.count; i++) {
          if (sim.villagers.activity[i] === Activity.Eat && sim.villagers.indoors[i])
            atTable.add(i);
        }
      });
      const s = sim.stats();
      assert.equal(s.mealsServed + s.mealsMissed, 2 * people, 'two meals each');
      assert.equal(s.mealsMissed, 0, 'the larder was full');
      assert.ok(
        Math.abs(food0 - sim.economy.stock.food - 2 * people * MEAL_FOOD) < 1e-6,
        `${food0} -> ${sim.economy.stock.food}`,
      );
      assert.equal(atMidday, people, 'the midday round was over by the middle of the afternoon');
      assert.ok(atTable.size > 0, 'nobody ate indoors');
    });
  },
);

await check('an empty larder serves nobody, and a short round is a hungry one', () => {
  withNoFood(() => {
    const sim = village();
    sim.economy.drainFood();
    run(sim, 0, 0.6 * DAY_S); // both rounds
    const s = sim.stats();
    assert.equal(s.mealsServed, 0);
    assert.equal(s.mealsMissed, 2 * sim.villagers.count);
    assert.equal(sim.economy.hungry, true);
    // food for the midday round only: the evening round is short
    const half = village();
    half.economy.drainFood();
    half.economy.addFood(half.villagers.count * MEAL_FOOD + 1e-6);
    run(half, 0, 0.3 * DAY_S);
    assert.equal(half.stats().mealsMissed, 0);
    assert.equal(half.economy.hungry, false, 'everyone was served at midday');
    run(half, 0.3 * DAY_S, 0.3 * DAY_S);
    assert.equal(half.economy.hungry, true, 'the evening round found the larder bare');
  });
});

await check(
  'a farmer far from home eats a packed meal where they stand, and goes back to the field',
  () => {
    withNoFood(() => {
      const sim = village();
      sim.economy.addFood(Number.POSITIVE_INFINITY);
      const v = sim.villagers;
      for (let i = 0; i < v.count; i++) v.offset[i] = 0;
      const farmer = idsWhere(sim, (i) => v.role[i] === Role.Farmer)[0]!;
      let ate = 0;
      let drift = 0;
      let at: [number, number] | null = null;
      run(sim, 0, 0.35 * DAY_S, () => {
        if (v.activity[farmer] === Activity.Eat) {
          assert.equal(v.indoors[farmer], 0, 'outdoors');
          if (v.mode[farmer] === Mode.Acting) {
            ate++;
            at ??= [v.x[farmer]!, v.z[farmer]!];
            drift = Math.max(drift, Math.hypot(v.x[farmer]! - at[0], v.z[farmer]! - at[1]));
          }
        }
      });
      assert.ok(ate * DT >= V.MEAL.EAT_S.MIN - 0.5, `ate for ${(ate * DT).toFixed(1)} s`);
      assert.ok(drift < 0.5, `moved ${drift.toFixed(1)} m while eating`);
      assert.equal(sim.stats().mealsServed, v.count, 'the whole village ate once');
      assert.equal(v.activity[farmer], Activity.Work, 'back at work');
    });
  },
);

await check('a villager without a home eats on the plaza, not indoors', () => {
  withNoFood(() => {
    const sim = village();
    sim.economy.addFood(Number.POSITIVE_INFINITY);
    const who = idsWhere(sim, (i) => sim.villagers.role[i] === Role.Farmer)[0]!;
    sim.villagers.home[who] = 987654;
    const temple = sim.buildings.find((b) => b.type === 'temple')!;
    let seen = 0;
    let far = 0;
    run(sim, 0, 0.35 * DAY_S, () => {
      const v = sim.villagers;
      if (v.activity[who] === Activity.Eat && v.mode[who] === Mode.Acting) {
        assert.equal(v.indoors[who], 0, 'outdoors');
        seen++;
        far = Math.max(far, Math.hypot(v.x[who]! - temple.x, v.z[who]! - temple.z));
      }
    });
    assert.ok(seen > 0, 'never ate on the plaza');
    assert.ok(far <= V.PLAZA_RADIUS_M + 3, `${far.toFixed(1)} m from the temple`);
  });
});

await check(
  'rain: everyone but the priests goes home, stays while it drizzles, and comes out when it stops',
  () => {
    const sim = village();
    sim.economy.addFood(Number.POSITIVE_INFINITY);
    const rain = (t: number) => (t < 400 ? 0 : t < 440 ? 0.5 : t < 560 ? 0.2 : 0);
    const priests = idsWhere(sim, (i) => sim.villagers.role[i] === Role.Priest);
    const others = idsWhere(sim, (i) => sim.villagers.role[i] !== Role.Priest);
    const inState = (ids: number[], activity: number) =>
      ids.filter((i) => sim.villagers.activity[i] === activity).length;
    let sheltering = -1;
    let sheltered = -1;
    let drizzle = -1;
    let outAgain = { shelter: -1, indoors: -1 };
    run(
      sim,
      0,
      640,
      (t) => {
        if (Math.abs(t - 438) < DT / 2) sheltering = inState(others, Activity.Shelter);
        if (Math.abs(t - 555) < DT / 2) {
          drizzle = inState(others, Activity.Shelter);
          sheltered = others.filter((i) => sim.villagers.indoors[i]).length;
        }
        if (Math.abs(t - 630) < DT / 2) {
          outAgain = {
            shelter: inState(others, Activity.Shelter),
            indoors: others.filter((i) => sim.villagers.indoors[i]).length,
          };
        }
      },
      { rain },
    );
    assert.equal(sheltering, others.length, 'all of them head home when the rain comes');
    assert.equal(drizzle, others.length, 'a drizzle (0.2) does not bring them out');
    assert.equal(sheltered, others.length, 'and they are indoors');
    assert.deepEqual(outAgain, { shelter: 0, indoors: 0 }, 'dry again: back out');
    assert.ok(
      priests.every((i) => sim.villagers.activity[i] !== Activity.Shelter),
      'priests were at the temple all along',
    );
  },
);

await check(
  'mourning: with a grave the priests go to it at dusk for a minute, then home; without, they pray',
  () => {
    const dusk = { phase: () => 0.69 };
    const prepare = (grave: boolean) => {
      const sim = village();
      sim.economy.addFood(Number.POSITIVE_INFINITY);
      for (let i = 0; i < sim.villagers.count; i++) sim.villagers.offset[i] = 0;
      if (grave) {
        const events: VillageEvent[] = [];
        const victim = sim.killOne(events);
        assert.ok(victim >= 0);
        run(sim, 0, 20, undefined, { phase: () => 0.4 }); // the collapse and the burial
        assert.equal(sim.stats().graves, 1);
      }
      return sim;
    };
    const priestsOf = (sim: VillageSim) =>
      idsWhere(sim, (i) => sim.villagers.role[i] === Role.Priest && sim.villagers.dying[i] === 0);

    const without = prepare(false);
    run(without, 100, 60, undefined, dusk);
    assert.ok(priestsOf(without).every((i) => without.villagers.activity[i] === Activity.Pray));

    const sim = prepare(true);
    const priests = priestsOf(sim);
    assert.ok(priests.length > 0);
    const plot = sim.serialize().graveyard.site;
    assert.ok(plot, 'a graveyard plot');
    let mourningSteps = 0;
    let nearest = Number.POSITIVE_INFINITY;
    run(
      sim,
      100,
      300,
      () => {
        for (const i of priests) {
          const v = sim.villagers;
          if (v.activity[i] === Activity.Mourn && v.mode[i] === Mode.Acting) {
            mourningSteps++;
            nearest = Math.min(nearest, Math.hypot(v.x[i]! - plot!.x, v.z[i]! - plot!.z));
          }
        }
      },
      dusk,
    );
    assert.ok(nearest <= 12, `a priest stood ${nearest.toFixed(1)} m from the plot`);
    const seconds = (mourningSteps * DT) / priests.length;
    assert.ok(
      seconds > V.MOURN_S * 0.8 && seconds < V.MOURN_S * 1.2,
      `mourned for ${seconds.toFixed(0)} s each`,
    );
    assert.ok(
      priests.every((i) => sim.villagers.activity[i] === Activity.Shelter),
      'and then went home',
    );
  },
);

await check('idlers keep to the plaza by day and are home by dusk', () => {
  const sim = village();
  sim.economy.addFood(Number.POSITIVE_INFINITY);
  for (let i = 0; i < sim.villagers.count; i++) sim.villagers.offset[i] = 0;
  const temple = sim.buildings.find((b) => b.type === 'temple')!;
  const idlers = idsWhere(sim, (i) => sim.villagers.role[i] === Role.Idler);
  assert.ok(idlers.length > 0, 'the hamlet has an idler');
  let far = 0;
  let samples = 0;
  run(sim, 0, 0.4 * DAY_S, () => {
    for (const i of idlers) {
      const v = sim.villagers;
      if (v.indoors[i] || v.activity[i] !== Activity.Wander) continue;
      samples++;
      far = Math.max(far, Math.hypot(v.x[i]! - temple.x, v.z[i]! - temple.z));
    }
  });
  assert.ok(samples > 0, 'the idlers never strolled');
  assert.ok(far <= V.PLAZA_RADIUS_M + 6, `strolled ${far.toFixed(1)} m from the temple`);
  for (const i of idlers) sim.villagers.piety[i] = 1;
  run(sim, 0.4 * DAY_S, 0.1 * DAY_S, undefined, { phase: () => 0.755 });
  run(sim, 0.5 * DAY_S, 60, undefined, { phase: () => 0.755 });
  assert.ok(
    idlers.every((i) => sim.villagers.activity[i] === Activity.Shelter && sim.villagers.indoors[i]),
    'every idler is at home at dusk',
  );
});

await check(
  'the day is deterministic, and a save in the middle of a meal continues identically',
  () => {
    const a = village();
    a.economy.addFood(Number.POSITIVE_INFINITY);
    const b = village();
    b.economy.addFood(Number.POSITIVE_INFINITY);
    const rain = (t: number) => (t > 500 && t < 600 ? 0.6 : 0);
    const total = 700;
    run(a, 0, total, undefined, { rain });
    run(b, 0, 330, undefined, { rain }); // inside the midday meal
    const saved = structuredClone(b.serialize());
    const resumed = makeSim(map, { mode: 'hamlet', restore: saved });
    run(b, 330, total - 330, undefined, { rain });
    run(resumed, 330, total - 330, undefined, { rain });
    assert.deepEqual(resumed.serialize(), a.serialize());
    assert.deepEqual(b.serialize(), a.serialize());
  },
);

finish('all routine checks passed');
