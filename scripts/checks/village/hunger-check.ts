// scripts/checks/village/hunger-check.ts — headless checks of hunger, death and the graveyard: the pure
// rules, the pool's swap-remove, and what a starving village does.
// Run: node --experimental-strip-types scripts/checks/village/hunger-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { Role, type VillageEvent } from '../../../src/world/village/model/types.ts';
import { graveyardProblem, plotAt } from '../../../src/world/village/sim/graveyard.ts';
import {
  createHungerState,
  DEATHS_AT_S,
  deathsAtS,
  type HungerState,
  hungerChange,
  hungerProblem,
  isWeak,
  pickVictim,
  stageOf,
  stepHunger,
  WEAK_AT_S,
} from '../../../src/world/village/sim/hunger.ts';
import { footprintFree, OCCUPANT } from '../../../src/world/village/sim/siteGrid.ts';
import { createVillagerPool, removeVillager } from '../../../src/world/village/sim/villagerPool.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  hoursSim,
  loadMap,
  makeSim,
  withYield,
} from '../lib/villageHeadless.ts';

const H = VILLAGE.HUNGER;
const E = VILLAGE.ECONOMY;
const map = loadMap('island-mountain');
const H_W = VILLAGE.GRAVEYARD.WIDTH_M;
const H_D = VILLAGE.GRAVEYARD.DEPTH_M;
/** No villager is protected as Aera. */
const NO_AERA = -1;

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

await check('hunger changes are announced once, at the lines that matter', () => {
  assert.equal(hungerChange('fed', 'fed'), null);
  assert.equal(hungerChange('fed', 'empty'), 'empty');
  assert.equal(hungerChange('empty', 'weak'), 'weak');
  assert.equal(hungerChange('fed', 'weak'), 'weak');
  assert.equal(hungerChange('weak', 'dying'), null, 'weak to dying crosses no line');
  assert.equal(hungerChange('dying', 'weak'), null);
  assert.equal(hungerChange('weak', 'empty'), null, 'recovering part-way is not news');
  assert.equal(hungerChange('empty', 'fed'), 'recovered');
  assert.equal(hungerChange('dying', 'fed'), 'recovered');
});

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
      const v = pickVictim(pool, 0, false, NO_AERA);
      order.push(v);
      pool.dying[v] = 1;
    }
    assert.deepEqual(
      order.map((i) => pool.role[i]),
      [Role.Idler, Role.Idler, Role.Woodcutter, Role.Builder, Role.Fisherman, Role.Farmer],
    );
    assert.equal(order[0], 4, 'the newer idler first');
    assert.equal(
      pickVictim(pool, 0, false, NO_AERA),
      -1,
      'only the elder is left: he is spared, and he is the last',
    );
    // converted: priests go last, the elder last of them
    const p2 = poolOf([Role.Priest, Role.Priest, Role.Priest, Role.Farmer]);
    assert.equal(pickVictim(p2, 0, true, NO_AERA), 3);
    p2.dying[3] = 1;
    assert.equal(
      pickVictim(p2, 0, true, NO_AERA),
      2,
      'a priest who is not the elder before the elder',
    );
    p2.dying[2] = 1;
    assert.equal(pickVictim(p2, 0, true, NO_AERA), 1);
    p2.dying[1] = 1;
    assert.equal(pickVictim(p2, 0, true, NO_AERA), -1, 'the last one is never picked');
    assert.equal(pickVictim(poolOf([Role.Idler]), -1, true, NO_AERA), -1);
    const dyingAlready = poolOf([Role.Idler, Role.Idler, Role.Idler], [2]);
    assert.equal(
      pickVictim(dyingAlready, -1, true, NO_AERA),
      1,
      'someone already dying is not picked again',
    );
  },
);

await check('Aera is never picked, even when she would be the first to go', () => {
  const pool = poolOf([Role.Priest, Role.Idler, Role.Idler, Role.Farmer]);
  // Without her, the newest idler (2) goes first; with her at 2, the other idler does.
  assert.equal(pickVictim(pool, 0, true, NO_AERA), 2);
  assert.equal(pickVictim(pool, 0, true, 2), 1);
  pool.dying[1] = 1;
  assert.equal(pickVictim(pool, 0, true, 2), 3, 'then the farmer, never her');
  pool.dying[3] = 1;
  assert.equal(pickVictim(pool, 0, true, 2), 0, 'then the elder; she is spared to the end');
});

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

/** A hamlet (converted or not) where no food is made: the fields and the shore give nothing. */
function famine(converted: boolean) {
  const sim = makeSim(map, { mode: 'hamlet' });
  if (converted) convertVillage(sim);
  sim.economy.drainFood();
  return sim;
}

await check('graveyard state: saved values are checked', () => {
  const good = { site: null, graves: [{ x: 1, z: 2, yaw: 0.5 }] };
  assert.equal(graveyardProblem(good), null);
  assert.equal(graveyardProblem({ site: null, graves: [] }), null);
  for (const [what, bad] of [
    ['nothing', null],
    ['no graves list', { site: null }],
    ['site of the wrong type', { site: 5, graves: [] }],
    ['a grave without a yaw', { site: null, graves: [{ x: 1, z: 2 }] }],
    ['a grave that is not a number', { site: null, graves: [{ x: Number.NaN, z: 2, yaw: 0 }] }],
    ['an empty grave', { site: null, graves: [null] }],
  ] as const) {
    assert.match(graveyardProblem(bad) ?? '', /grave/, what);
  }
});

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
      hoursSim(sim, 3, (t, events) => {
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
        start,
        'every death left a grave and nobody else vanished',
      );
      assert.equal(graves, sim.stats().graves);
      assert.ok(minFaith >= 0, `faith went to ${minFaith}`);
    });
  },
);

await check(
  'nobody dies while there is food: deaths only after the full wait with an empty larder',
  () => {
    withYield(0, 0, () => {
      const sim = famine(true);
      let first = Number.POSITIVE_INFINITY;
      hoursSim(sim, 2, (t, events) => {
        if (events.some((e) => e.kind === 'villagerDying')) first = Math.min(first, t);
      });
      assert.ok(first >= (H.STARVE_GRACE_DAYS + H.DEATH_AFTER_DAYS) * DAY_S - 1);
      const fedSim = famine(true);
      let died = 0;
      hoursSim(fedSim, 2, (_t, events) => {
        fedSim.economy.addFood(Number.POSITIVE_INFINITY);
        died += events.filter((e) => e.kind === 'villagerDying').length;
      });
      assert.equal(died, 0);
      assert.equal(fedSim.stats().hunger, 'fed');
    });
  },
);

await check(
  'removals leave no stale index: the elder, claims and queues follow the villager who moved',
  () => {
    withYield(0, 0, () => {
      const sim = famine(true);
      const events: VillageEvent[] = [];
      let step = 0;
      hoursSim(sim, 2.5, (_t, ev) => {
        for (const e of ev) events.push(e);
        // Serializing copies the whole pool, so look on the steps a removal happened and every 2 s between.
        const removed = ev.some((e) => e.kind === 'villagerDied');
        if (!removed && step++ % 20 !== 0) return;
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
      hoursSim(sim, 0.2);
      hoursSim(resumed, 0.2);
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
    const start = sim.villagers.count;
    const victim = sim.killOne(events);
    assert.ok(victim >= 0);
    assert.ok(events.some((e) => e.kind === 'villagerDying' && e.villager === victim));
    assert.equal(sim.addBelief(victim, 1, events), false);
    assert.equal(sim.notice(victim, 0, 0, 1), false);
    assert.ok(sim.villagers.dying[victim]! > 0);
    sim.faith.faith = 20;
    sim.killOne(events);
    assert.equal(sim.faith.faith, 20 - H.DEATH_FAITH_COST);
    sim.faith.faith = 1;
    sim.killOne(events);
    assert.equal(sim.faith.faith, 0, 'faith is floored at zero');
    sim.starve(events);
    assert.equal(sim.economy.stock.food, 0);
    assert.equal(sim.stats().hunger, 'weak');
    assert.ok(events.some((e) => e.kind === 'hunger'));
    // after the collapse and the fade the body is gone and a grave stands
    hoursSim(sim, 0.01);
    assert.equal(sim.stats().graves, 3, 'all three are gone and each left a grave');
    assert.equal(sim.villagers.count, start - 3);
  },
);

finish('all hunger checks passed');
