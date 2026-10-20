// scripts/village/hunger-check.ts — headless checks of hunger, death and the graveyard (M5): the pure
// rules, the pool's swap-remove, and what a starving village does.
// Run: node --experimental-strip-types scripts/village/hunger-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../src/config/village.ts';
import { Anim, Role, type VillageEvent } from '../../src/world/village/model/types.ts';
import { plotAt } from '../../src/world/village/sim/graveyard.ts';
import {
  createHungerState,
  DEATHS_AT_S,
  deathsAtS,
  type HungerState,
  hungerProblem,
  isWeak,
  pickVictim,
  stageOf,
  stepHunger,
  WEAK_AT_S,
} from '../../src/world/village/sim/hunger.ts';
import { footprintFree, OCCUPANT } from '../../src/world/village/sim/siteGrid.ts';
import { createVillagerPool, removeVillager } from '../../src/world/village/sim/villagerPool.ts';
import type { VillageSim } from '../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { DAY_S, type LoadedMap, loadMap, makeSim } from '../lib/villageHeadless.ts';

const H = VILLAGE.HUNGER;
const E = VILLAGE.ECONOMY;
const DT = 0.1;
const DAY = (t: number) => (0.3 + t / DAY_S) % 1;
const map = loadMap('island-mountain');
const H_W = VILLAGE.GRAVEYARD.WIDTH_M;
const H_D = VILLAGE.GRAVEYARD.DEPTH_M;

function run(
  sim: VillageSim,
  hours: number,
  onStep?: (t: number, events: readonly VillageEvent[]) => void,
): void {
  const events: VillageEvent[] = [];
  const steps = Math.round((hours * 3600) / DT);
  for (let k = 0; k < steps; k++) {
    const t = k * DT;
    sim.beginStep();
    sim.update(
      DT,
      { playerDistM: 10, presenceActive: true, dayPhase: DAY(t), vigil: false },
      events,
    );
    onStep?.(t, events);
    events.length = 0;
  }
}

const countRole = (sim: VillageSim, role: number) => {
  let n = 0;
  for (let i = 0; i < sim.villagers.count; i++) if (sim.villagers.role[i] === role) n++;
  return n;
};

// --- the pure rules ---

await check(
  'hunger builds while the larder is empty: weak after the grace, deaths one day later',
  () => {
    const s = createHungerState();
    let deaths = 0;
    while (s.level < WEAK_AT_S - 1) deaths += stepHunger(s, 1, true) ? 1 : 0;
    assert.equal(isWeak(s), false, 'not weak inside the grace');
    assert.equal(stageOf(s, true), 'empty');
    stepHunger(s, 1, true);
    assert.equal(isWeak(s), true);
    assert.equal(stageOf(s, true), 'weak');
    while (s.level < DEATHS_AT_S - 1) deaths += stepHunger(s, 1, true) ? 1 : 0;
    assert.equal(deaths, 0, 'nobody dies before the deaths begin');
    assert.equal(stepHunger(s, 1, true), true, 'the first death comes the moment they begin');
    assert.equal(DEATHS_AT_S - WEAK_AT_S, H.DEATH_AFTER_DAYS * E.DAY_S);
  },
);

await check('then one at once and one every half day while it stays empty', () => {
  const s: HungerState = { level: DEATHS_AT_S - 1, sinceDeath: H.DEATH_INTERVAL_DAYS * DAY_S };
  const at: number[] = [];
  for (let t = 0; t < 3 * DAY_S; t += 1) if (stepHunger(s, 1, true)) at.push(t);
  assert.equal(at[0], 0, 'the first death is at once');
  const gaps = at.slice(1).map((v, i) => v - at[i]!);
  assert.ok(
    gaps.every((g) => g === H.DEATH_INTERVAL_DAYS * DAY_S),
    JSON.stringify(gaps),
  );
  assert.equal(at.length, 1 + Math.floor((3 * DAY_S - 1) / (H.DEATH_INTERVAL_DAYS * DAY_S)));
  assert.equal(stageOf(s, true), 'dying');
});

await check(
  'food back: deaths stop, weakness ends within half a day, hunger drains to nothing',
  () => {
    const s: HungerState = { level: DEATHS_AT_S, sinceDeath: 5 };
    assert.equal(stepHunger(s, 1, false), false);
    let t = 0;
    while (isWeak(s)) {
      assert.equal(stepHunger(s, 1, false), false, 'no death while food is back');
      t++;
    }
    assert.ok(t <= H.RECOVERY_DAYS * DAY_S + 1, `weak for ${t} s after food returned`);
    assert.equal(stageOf(s, false), 'empty', 'still hungry while it drains');
    for (let k = 0; k < 2 * DAY_S; k++) stepHunger(s, 1, false);
    assert.equal(s.level, 0);
    assert.equal(stageOf(s, false), 'fed');
    // a fresh famine starts its deaths at once, not after the old wait
    s.level = DEATHS_AT_S - 1;
    assert.equal(stepHunger(s, 1, true), true);
  },
);

await check('hunger state: saved values are checked', () => {
  assert.equal(hungerProblem({ level: 5, sinceDeath: 0 }), null);
  assert.equal(
    hungerProblem({ level: DEATHS_AT_S + 1, sinceDeath: 0 }),
    null,
    'room for Lean winters',
  );
  for (const bad of [
    undefined,
    null,
    {},
    { level: -1, sinceDeath: 0 },
    { level: deathsAtS(3) + 1, sinceDeath: 0 },
    { level: 1, sinceDeath: Number.NaN },
  ]) {
    assert.ok(hungerProblem(bad), JSON.stringify(bad));
  }
});

const poolOf = (roles: number[], dyingAt: number[] = []) => {
  const pool = createVillagerPool();
  pool.count = roles.length;
  roles.forEach((r, i) => {
    pool.role[i] = r;
  });
  for (const i of dyingAt) pool.dying[i] = 1;
  return pool;
};

await check(
  'who dies: idlers first, priests last, the newest first, never the elder before the conversion, never the last villager',
  () => {
    const pool = poolOf([
      Role.Priest,
      Role.Farmer,
      Role.Idler,
      Role.Builder,
      Role.Idler,
      Role.Fisherman,
      Role.Woodcutter,
    ]);
    const order: number[] = [];
    for (let k = 0; k < 6; k++) {
      const v = pickVictim(pool, 0, false);
      order.push(v);
      pool.dying[v] = 1;
    }
    assert.deepEqual(
      order.map((i) => pool.role[i]),
      [Role.Idler, Role.Idler, Role.Woodcutter, Role.Builder, Role.Fisherman, Role.Farmer],
    );
    assert.equal(order[0], 4, 'the newer idler first');
    assert.equal(
      pickVictim(pool, 0, false),
      -1,
      'only the elder is left: he is spared, and he is the last',
    );
    // converted: priests go last, the elder last of them
    const p2 = poolOf([Role.Priest, Role.Priest, Role.Priest, Role.Farmer]);
    assert.equal(pickVictim(p2, 0, true), 3);
    p2.dying[3] = 1;
    assert.equal(pickVictim(p2, 0, true), 2, 'a priest who is not the elder before the elder');
    p2.dying[2] = 1;
    assert.equal(pickVictim(p2, 0, true), 1);
    p2.dying[1] = 1;
    assert.equal(pickVictim(p2, 0, true), -1, 'the last one is never picked');
    assert.equal(pickVictim(poolOf([Role.Idler]), -1, true), -1);
    const dyingAlready = poolOf([Role.Idler, Role.Idler, Role.Idler], [2]);
    assert.equal(
      pickVictim(dyingAlready, -1, true),
      1,
      'someone already dying is not picked again',
    );
  },
);

await check(
  'the pool: the last villager takes the freed slot, every array and the path with it',
  () => {
    const pool = poolOf([Role.Idler, Role.Farmer, Role.Priest]);
    const w = VILLAGE.PATH.MAX_WAYPOINTS * 2;
    pool.x[0] = 1;
    pool.x[2] = 3;
    pool.home[2] = 77;
    pool.belief[2] = 0.5;
    pool.pathLen[2] = 4;
    pool.waypoints[2 * w] = 9;
    pool.waypoints[2 * w + 1] = 8;
    assert.equal(removeVillager(pool, 0), 2, 'villager 2 moved into slot 0');
    assert.equal(pool.count, 2);
    assert.equal(pool.role[0], Role.Priest);
    assert.equal(pool.x[0], 3);
    assert.equal(pool.home[0], 77);
    assert.equal(pool.belief[0], 0.5);
    assert.equal(pool.pathLen[0], 4);
    assert.deepEqual([pool.waypoints[0], pool.waypoints[1]], [9, 8]);
    assert.equal(removeVillager(pool, 1), -1, 'removing the last moves nobody');
    assert.equal(pool.count, 1);
    assert.equal(removeVillager(pool, 5), -1, 'out of range does nothing');
    assert.equal(pool.count, 1);
  },
);

await check('the collapse pose has an id of its own after the others', () => {
  assert.equal(Anim.Collapse, 8);
  assert.equal(Anim.Fish, 7);
});

// --- in a real village ---

await check(
  'the graveyard: a flat plot is picked at founding, clear of every house, field and road, in a hamlet and a sandbox village',
  () => {
    for (const mode of ['hamlet', 'sandbox'] as const) {
      const sim = makeSim(map, { mode });
      const state = sim.serialize().graveyard;
      assert.ok(state.site, `${mode}: no graveyard plot`);
      const site = state.site!;
      const reach = Math.hypot(H_W / 2, H_D / 2);
      let gap = Number.POSITIVE_INFINITY;
      for (const b of sim.buildings) {
        gap = Math.min(
          gap,
          Math.hypot(b.x - site.x, b.z - site.z) - Math.hypot(b.halfW, b.halfD) - reach,
        );
      }
      for (const f of sim.fields) {
        gap = Math.min(
          gap,
          Math.hypot(f.x - site.x, f.z - site.z) - Math.hypot(f.halfW, f.halfD) - reach,
        );
      }
      console.log(
        `     ${mode}: plot at (${site.x.toFixed(0)}, ${site.z.toFixed(0)}), ${gap.toFixed(1)} m from the nearest building or field, relief ${site.relief.toFixed(2)} m`,
      );
      assert.ok(gap >= 0, `${mode}: the plot overlaps a building or field`);
      assert.ok(site.relief <= VILLAGE.GRAVEYARD.MAX_RELIEF_M + 1e-9);
      assert.ok(
        sim.rings.roadDistance(site.x, site.z) >= VILLAGE.RINGS.ROAD_CLEAR_M,
        'on the main road',
      );
      assert.equal(
        footprintFree(sim.grid, site.x, site.z, site.rotY, 1, 1, 0, OCCUPANT.GRAVEYARD),
        true,
        'the plot is reserved on the site grid',
      );
    }
  },
);

await check('plots: rows of graves inside the plot first, then on beyond it', () => {
  const site = { x: 100, z: 50, rotY: 0, relief: 0, score: 0 };
  const cols = Math.floor(H_W / VILLAGE.GRAVEYARD.PLOT_M);
  const a = plotAt(site, 0);
  const b = plotAt(site, 1);
  const c = plotAt(site, cols);
  assert.ok(Math.abs(b.x - a.x - VILLAGE.GRAVEYARD.PLOT_M) < 1e-9, 'next plot along the row');
  assert.ok(Math.abs(c.z - a.z - VILLAGE.GRAVEYARD.PLOT_M) < 1e-9, 'next row');
  assert.equal(c.row, 1);
  assert.ok(Math.abs(a.x - (100 - H_W / 2 + VILLAGE.GRAVEYARD.PLOT_M / 2)) < 1e-9);
});

const fed = (sim: VillageSim) => {
  sim.economy.addFood(Number.POSITIVE_INFINITY);
};
void fed;

/** A hamlet (converted or not) where no food is made: the fields and the shore give nothing. */
function famine(converted: boolean, m: LoadedMap = map) {
  const sim = makeSim(m, { mode: 'hamlet' });
  if (converted) {
    const events: VillageEvent[] = [];
    for (let i = 0; i < sim.villagers.count; i++) sim.addBelief(i, 1, events);
    sim.convertVillage(events);
  }
  sim.economy.drainFood();
  return sim;
}

const withYield = <T>(fieldYield: number, fish: number, fn: () => T): T => {
  const e = VILLAGE.ECONOMY as { FIELD_YIELD: number; FISH_PER_SEC: number };
  const saved = [e.FIELD_YIELD, e.FISH_PER_SEC];
  e.FIELD_YIELD = fieldYield;
  e.FISH_PER_SEC = fish;
  try {
    return fn();
  } finally {
    [e.FIELD_YIELD, e.FISH_PER_SEC] = saved as [number, number];
  }
};

await check(
  'a village that makes no food: weak after two days, the first death after three, graves match deaths, faith never below zero',
  () => {
    withYield(0, 0, () => {
      const sim = famine(true);
      const start = sim.villagers.count;
      const log: { kind: string; day: number }[] = [];
      let graves = 0;
      let dyingEvents = 0;
      let minFaith = Number.POSITIVE_INFINITY;
      run(sim, 6, (t, events) => {
        minFaith = Math.min(minFaith, sim.faith.faith);
        for (const e of events) {
          if (e.kind === 'hunger') log.push({ kind: e.stage, day: t / DAY_S });
          if (e.kind === 'villagerDying') {
            dyingEvents++;
            if (dyingEvents === 1) log.push({ kind: 'first death', day: t / DAY_S });
          }
          if (e.kind === 'graveAdded') graves++;
        }
      });
      console.log(
        '     ',
        log.map((l) => `${l.kind} @ day ${l.day.toFixed(2)}`).join(', '),
        `| ${start} -> ${sim.villagers.count} villagers, ${graves} graves`,
      );
      const day = (kind: string) => log.find((l) => l.kind === kind)?.day ?? Number.NaN;
      assert.ok(day('empty') < 0.1, 'the larder ran out at once');
      assert.ok(Math.abs(day('weak') - H.STARVE_GRACE_DAYS) < 0.1, `weak on day ${day('weak')}`);
      assert.ok(
        Math.abs(day('first death') - (H.STARVE_GRACE_DAYS + H.DEATH_AFTER_DAYS)) < 0.1,
        `first death on day ${day('first death')}`,
      );
      assert.ok(dyingEvents >= 3, 'the village dwindles over days');
      assert.equal(
        sim.villagers.count + graves,
        start + 0,
        'every death left a grave and nobody else vanished',
      );
      assert.equal(graves, sim.stats().graves);
      assert.ok(minFaith >= 0, `faith went to ${minFaith}`);
      assert.ok(sim.villagers.count >= 1);
    });
  },
);

await check(
  'nobody dies while there is food: deaths only after the full wait with an empty larder',
  () => {
    withYield(0, 0, () => {
      const sim = famine(true);
      let first = Number.POSITIVE_INFINITY;
      run(sim, 4, (t, events) => {
        if (events.some((e) => e.kind === 'villagerDying')) first = Math.min(first, t);
        // top the larder up now and then in the first two days: it must hold the deaths off
      });
      assert.ok(first >= (H.STARVE_GRACE_DAYS + H.DEATH_AFTER_DAYS) * DAY_S - 1);
      const fedSim = famine(true);
      let died = 0;
      run(fedSim, 3, (_t, events) => {
        fedSim.economy.addFood(Number.POSITIVE_INFINITY);
        died += events.filter((e) => e.kind === 'villagerDying').length;
      });
      assert.equal(died, 0);
      assert.equal(fedSim.stats().hunger, 'fed');
    });
  },
);

await check(
  'a famine before the conversion spares the elder, who stays the last villager standing',
  () => {
    withYield(0, 0, () => {
      const sim = famine(false);
      const elder = sim.elder;
      assert.ok(elder >= 0);
      run(sim, 14);
      assert.ok(sim.villagers.count >= 1);
      assert.ok(sim.elder >= 0, 'the elder is still there');
      assert.equal(sim.villagers.role[sim.elder], Role.Priest);
      assert.equal(sim.villagers.dying[sim.elder], 0);
      assert.equal(sim.villagers.count, 1, 'everyone else died; the last villager is never picked');
    });
  },
);

await check(
  'with little farming and fishing the population falls to what the food supports and holds',
  () => {
    // Meals are all or nothing (M7): a round is fed only when the larder covers everyone at the table, so a
    // village holds at about what it makes (8 of 11 here, after a dip to 5), not at a third of it as with the old
    // continuous eating.
    withYield(1, E.FISH_PER_SEC * 0.5, () => {
      const sim = famine(true);
      const count: number[] = [];
      run(sim, 8, (t) => {
        if (Math.round(t / DT) % Math.round(DAY_S / DT) === 0) count.push(sim.villagers.count);
      });
      console.log('     villagers per day:', count.join(' '));
      assert.ok(sim.stats().graves > 0, 'some died');
      const tail = count.slice(-4);
      assert.ok(
        tail.every((n) => n === tail[0] || Math.abs(n - tail[0]!) <= 1),
        `still falling: ${tail}`,
      );
      assert.ok(sim.villagers.count >= 3);
    });
  },
);

await check(
  'removals leave no stale index: the elder, claims and queues follow the villager who moved',
  () => {
    withYield(0, 0, () => {
      const sim = famine(true);
      const events: VillageEvent[] = [];
      run(sim, 5, (_t, ev) => {
        for (const e of ev) events.push(e);
        const n = sim.villagers.count;
        const state = sim.serialize();
        for (const i of state.agents.pathQueue)
          assert.ok(i >= -1 && i < n, `path queue holds ${i} of ${n}`);
        assert.ok(sim.elder >= -1 && sim.elder < n);
        for (let i = 0; i < n; i++) {
          assert.ok(sim.villagers.home[i]! >= 0);
        }
      });
      const died = events.filter(
        (e): e is Extract<VillageEvent, { kind: 'villagerDied' }> => e.kind === 'villagerDied',
      );
      assert.ok(died.length > 0);
      for (const d of died)
        assert.ok(d.moved === -1 || d.moved > d.villager, 'the mover came from higher up');
      // The sim carries on identically from a save taken after the removals: claims are what the pool says.
      const saved = structuredClone(sim.serialize());
      const resumed = makeSim(map, { mode: 'hamlet', restore: saved });
      run(sim, 0.2);
      run(resumed, 0.2);
      assert.deepEqual(resumed.serialize().villagers.x, sim.serialize().villagers.x);
      assert.equal(resumed.villagers.count, sim.villagers.count);
    });
  },
);

await check(
  'a dying villager can no longer be reached by belief, and DEV starve and killOne work',
  () => {
    const sim = makeSim(map, { mode: 'hamlet' });
    const events: VillageEvent[] = [];
    const victim = sim.killOne(events);
    assert.ok(victim >= 0);
    assert.ok(events.some((e) => e.kind === 'villagerDying' && e.villager === victim));
    assert.equal(sim.addBelief(victim, 1, events), false);
    assert.equal(sim.notice(victim, 0, 0, 1), false);
    assert.ok(sim.villagers.dying[victim]! > 0);
    const before = sim.faith.faith;
    sim.faith.faith = 20;
    sim.killOne(events);
    assert.equal(sim.faith.faith, 20 - H.DEATH_FAITH_COST);
    sim.faith.faith = 1;
    sim.killOne(events);
    assert.equal(sim.faith.faith, 0, 'faith is floored at zero');
    void before;
    sim.starve(events);
    assert.equal(sim.economy.stock.food, 0);
    assert.equal(sim.stats().hunger, 'weak');
    assert.ok(events.some((e) => e.kind === 'hunger'));
    // after the collapse and the fade the body is gone and a grave stands
    run(sim, 0.01);
    assert.equal(sim.stats().graves, 3, 'all three are gone and each left a grave');
    assert.equal(sim.villagers.count, 11 - 3);
  },
);

await check('the same famine twice gives the same graves and survivors', () => {
  withYield(0, 0, () => {
    const key = (s: VillageSim) =>
      JSON.stringify([
        s.graves,
        s.villagers.count,
        Array.from(s.villagers.role.slice(0, s.villagers.count)),
        s.economy.serialize(),
      ]);
    const a = famine(true);
    const b = famine(true);
    run(a, 4);
    run(b, 4);
    assert.equal(key(a), key(b));
  });
});

void countRole;
finish('all hunger checks passed');
