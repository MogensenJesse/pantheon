// scripts/checks/village/plots-check.ts — the player marks a plot: the rules, the cost, the building and the save
// Run: node --experimental-strip-types --no-warnings scripts/checks/village/plots-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { PLOT_TYPES } from '../../../src/world/village/model/buildings.ts';
import type { VillageEvent } from '../../../src/world/village/model/types.ts';
import { woodCostOf } from '../../../src/world/village/sim/economy.ts';
import { siteCost } from '../../../src/world/village/sim/faith.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import type { PlotResult } from '../../../src/world/village/sim/villageSimTypes.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
} from '../lib/villageHeadless.ts';

const map = loadMap('island-mountain');
const { seed } = map;

/** A grown, converted village, made once and restored from for each check. */
const grown = (() => {
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  stepSim(sim, { seconds: 2 * DAY_S, fed: true });
  return sim.serialize();
})();
const rich = (): VillageSim => {
  const sim = makeSim(map, { mode: 'hamlet', restore: structuredClone(grown) });
  sim.faith.faith = 500;
  sim.economy.addWood(500);
  // The planner keeps its sites open; finish them so the cap is free for the player's plots.
  for (const b of sim.buildings.filter((x) => x.stage < 2 || x.upgrade > 0)) sim.kindle(b.id, []);
  return sim;
};

/** Spots around the village, nearest the temple first, that the sim accepts for a house. */
function freeSpots(sim: VillageSim, count: number): { x: number; z: number; rot: number }[] {
  const out: { x: number; z: number; rot: number }[] = [];
  for (let r = 40; r < seed.radiusM && out.length < count; r += 5) {
    for (let k = 0; k < 36 && out.length < count; k++) {
      const a = (k / 36) * Math.PI * 2;
      const x = seed.x + Math.sin(a) * r;
      const z = seed.z + Math.cos(a) * r;
      const rot = sim.plotFacing(x, z);
      if (sim.plotCheck('house_b', x, z, rot) === 'ok') out.push({ x, z, rot });
    }
  }
  return out;
}

await check(
  'a village that has not converted takes no plots, and only real building types do',
  () => {
    const hamlet = makeSim(map, { mode: 'hamlet' });
    assert.equal(hamlet.plotCheck('house_a', seed.x + 50, seed.z, 0), 'not-converted');
    const sim = rich();
    assert.equal(sim.plotCheck('temple', seed.x + 50, seed.z, 0), 'type');
    assert.equal(sim.plotCheck('well', seed.x + 50, seed.z, 0), 'type');
    for (const type of PLOT_TYPES) assert.notEqual(sim.plotCheck(type, seed.x, seed.z, 0), 'type');
  },
);

await check(
  'the spot must hold the planner rules: inside the village, clear of the temple and the roads',
  () => {
    const sim = rich();
    const reasons = new Set<PlotResult>();
    reasons.add(sim.plotCheck('house_b', seed.x + seed.radiusM + 80, seed.z, 0));
    reasons.add(sim.plotCheck('house_b', seed.x, seed.z, 0));
    assert.ok(reasons.has('outside'), 'beyond the village');
    assert.ok(reasons.has('road') || reasons.has('blocked'), 'on the temple');
    for (const reason of reasons) assert.notEqual(reason, 'ok');
    // Every refusal over a sweep of the village is one of the named reasons.
    const named = new Set(['outside', 'road', 'blocked', 'unreachable', 'steep', 'far']);
    let ok = 0;
    let refused = 0;
    for (let r = 10; r < seed.radiusM; r += 15) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const result = sim.plotCheck(
          'house_b',
          seed.x + Math.sin(a) * r,
          seed.z + Math.cos(a) * r,
          0,
        );
        if (result === 'ok') ok++;
        else {
          refused++;
          assert.ok(named.has(result), `unexpected ${result}`);
        }
      }
    }
    assert.ok(ok > 0 && refused > 0, `${ok} fit and ${refused} do not`);
  },
);

await check('asking never moves the village: the random streams and the state stay put', () => {
  const sim = rich();
  const before = savedHash(sim);
  for (let k = 0; k < 40; k++) {
    sim.plotCheck('house_a', seed.x + k * 4, seed.z + (k % 7) * 9, k * 0.3);
  }
  assert.equal(savedHash(sim), before);
});

await check(
  'a plot starts a site where the player pointed, facing as given, and costs what a site costs',
  () => {
    const sim = rich();
    const [spot] = freeSpots(sim, 1);
    assert.ok(spot, 'a free spot');
    const count = sim.buildings.filter((b) => b.type !== 'temple').length;
    const wood = sim.economy.stock.wood;
    const faith = sim.faith.faith;
    const events: VillageEvent[] = [];
    assert.equal(sim.placePlot('house_b', spot.x, spot.z, spot.rot, events), 'ok');
    const started = events.find((e) => e.kind === 'siteStarted');
    assert.ok(started && started.kind === 'siteStarted');
    const b = started.building;
    assert.deepEqual([b.x, b.z, b.rotY, b.stage, b.level], [spot.x, spot.z, spot.rot, 0, 1]);
    assert.equal(sim.economy.stock.wood, wood - woodCostOf('house_b'));
    assert.equal(sim.faith.faith, faith - siteCost(count));
    assert.equal(
      sim.plotCheck('house_b', spot.x, spot.z, spot.rot),
      'blocked',
      'the spot is taken now',
    );
  },
);

await check(
  'a plot is refused with no wood or faith, and only a few sites are open at once',
  () => {
    const poor = rich();
    const [spot] = freeSpots(poor, 1);
    poor.faith.faith = 0;
    assert.equal(poor.placePlot('house_b', spot!.x, spot!.z, spot!.rot, []), 'faith');
    const bare = rich();
    bare.economy.spendWood(bare.economy.stock.wood);
    assert.equal(bare.placePlot('house_b', spot!.x, spot!.z, spot!.rot, []), 'wood');
    const sim = rich();
    const spots = freeSpots(sim, 8).filter((s, i, all) =>
      all.slice(0, i).every((p) => Math.hypot(p.x - s.x, p.z - s.z) > 30),
    );
    const open = sim.buildings.filter((b) => b.stage < 2 || b.upgrade > 0).length;
    const room = VILLAGE.PLAN.MAX_ACTIVE_SITES - open;
    let started = 0;
    let capped = false;
    for (const s of spots) {
      const r = sim.placePlot('house_b', s.x, s.z, s.rot, []);
      if (r === 'ok') started++;
      if (r === 'cap') capped = true;
    }
    assert.equal(started, Math.max(0, room));
    assert.ok(capped || spots.length <= room, 'the cap held');
  },
);

await check('builders raise the plot into a finished building', () => {
  const sim = rich();
  const [spot] = freeSpots(sim, 1);
  const events: VillageEvent[] = [];
  sim.placePlot('house_b', spot!.x, spot!.z, spot!.rot, events);
  const building = sim.buildings.find((b) => b.x === spot!.x && b.z === spot!.z)!;
  stepSim(sim, {
    seconds: 3 * DAY_S,
    from: 2 * DAY_S,
    fed: true,
    onStep: () => building.stage < 2,
  });
  assert.equal(building.stage, 2);
});

await check('a plot under way survives a save and carries on the same', () => {
  const sim = rich();
  const [spot] = freeSpots(sim, 1);
  sim.placePlot('house_b', spot!.x, spot!.z, spot!.rot, []);
  stepSim(sim, { seconds: 30, from: 2 * DAY_S, fed: true });
  const copy = makeSim(map, { mode: 'hamlet', restore: structuredClone(sim.serialize()) });
  assert.equal(savedHash(copy), savedHash(sim));
  const rest = { seconds: DAY_S, from: 2 * DAY_S + 30, fed: true } as const;
  stepSim(sim, rest);
  stepSim(copy, rest);
  assert.equal(savedHash(copy), savedHash(sim));
});

finish('all plot checks passed');
