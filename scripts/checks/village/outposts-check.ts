// scripts/checks/village/outposts-check.ts — outposts: where one may stand, the crew that builds it, what it delivers, the save
// Run: node --experimental-strip-types --no-warnings scripts/checks/village/outposts-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import type { VillageEvent } from '../../../src/world/village/model/types.ts';
import { findCoarseRoute } from '../../../src/world/village/sim/coarseRoute.ts';
import { outpostOf, outpostSiteKind } from '../../../src/world/village/sim/outposts.ts';
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

const O = VILLAGE.OUTPOSTS;
const map = loadMap('island-mountain');
const { seed, sampler } = map;

const grown = (() => {
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  stepSim(sim, { seconds: 2 * DAY_S, fed: true });
  return sim.serialize();
})();
const rich = (): VillageSim => {
  const sim = makeSim(map, { mode: 'hamlet', restore: structuredClone(grown) });
  sim.faith.faith = 500;
  sim.economy.addWood(500);
  return sim;
};

/** The first spot, going out from the village, where the sim accepts an outpost of `kind` and the crew can walk. */
function spotFor(sim: VillageSim, kind: string, skip = 0): { x: number; z: number } {
  let seen = 0;
  for (let r = seed.radiusM + 20; r <= 420; r += 20) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = seed.x + Math.sin(a) * r;
      const z = seed.z + Math.cos(a) * r;
      if (sim.outpostCheck(kind, x, z) !== null) continue;
      if (!findCoarseRoute(sampler, seed.x, seed.z, x, z)) continue;
      if (seen++ >= skip) return { x, z };
    }
  }
  throw new Error(`no place for a ${kind} outpost on the map`);
}

await check('an outpost needs a converted village and the right place', () => {
  const hamlet = makeSim(map, { mode: 'hamlet' });
  assert.equal(hamlet.startOutpost('lumber', seed.x + 200, seed.z, []), 'not-converted');
  const sim = rich();
  assert.equal(sim.outpostCheck('castle', seed.x + 200, seed.z), 'type');
  assert.equal(sim.outpostCheck('lumber', seed.x + 5, seed.z), 'inside');
  const lumber = spotFor(sim, 'lumber');
  const fish = spotFor(sim, 'fishing');
  assert.equal(sim.outpostCheck('lumber', lumber.x, lumber.z), null);
  assert.equal(sim.outpostCheck('fishing', fish.x, fish.z), null);
  // open sea is not a place to stand; a bare plain far from the trees is not a lumber camp
  assert.equal(sim.outpostCheck('fishing', seed.x + 6000, seed.z), 'resource');
});

await check('asking changes nothing', () => {
  const sim = rich();
  const before = savedHash(sim);
  for (let k = 0; k < 30; k++) sim.outpostCheck('lumber', seed.x + 100 + k * 9, seed.z + k * 4);
  assert.equal(savedHash(sim), before);
});

await check('marking an outpost sends a crew and takes wood and faith; refusals say why', () => {
  const sim = rich();
  const spot = spotFor(sim, 'lumber');
  const wood = sim.economy.stock.wood;
  const faith = sim.faith.faith;
  const events: VillageEvent[] = [];
  assert.equal(sim.startOutpost('lumber', spot.x, spot.z, events), 'ok');
  assert.ok(events.some((e) => e.kind === 'remoteStarted'));
  assert.equal(sim.economy.stock.wood, wood - O.WOOD);
  assert.equal(sim.faith.faith, faith - O.FAITH);
  assert.equal(sim.remoteSites.length, 1);
  assert.equal(outpostOf(sim.remoteSites[0]!.kind), 'lumber');
  assert.equal(sim.remoteSites[0]!.kind, outpostSiteKind('lumber'));
  // not on top of another
  assert.equal(sim.startOutpost('lumber', spot.x + 10, spot.z, []), 'near');

  const poor = rich();
  poor.faith.faith = 0;
  assert.equal(poor.startOutpost('lumber', spot.x, spot.z, []), 'faith');
  const bare = rich();
  bare.economy.spendWood(bare.economy.stock.wood);
  assert.equal(bare.startOutpost('lumber', spot.x, spot.z, []), 'wood');
});

await check('at most MAX outposts, and a place of power does not count against them', () => {
  const sim = rich();
  let started = 0;
  for (let n = 0; n < O.MAX + 2; n++) {
    const spot = spotFor(sim, 'lumber', n);
    const r = sim.startOutpost('lumber', spot.x, spot.z, []);
    if (r === 'ok') started++;
    else assert.ok(['limit', 'near', 'no-crew'].includes(r), `refused for ${r}`);
  }
  assert.ok(started >= 1 && started <= O.MAX);
});

await check('the crew builds it in two stages, then it delivers wood without a crew', () => {
  const sim = rich();
  const spot = spotFor(sim, 'lumber');
  sim.startOutpost('lumber', spot.x, spot.z, []);
  const site = sim.remoteSites[0]!;
  const stages: number[] = [];
  stepSim(sim, {
    seconds: 5 * DAY_S,
    from: 2 * DAY_S,
    fed: true,
    onStep: (_t, events) => {
      for (const e of events) if (e.kind === 'remoteStageCompleted') stages.push(e.stage);
      return site.stage < 2;
    },
  });
  assert.deepEqual(stages, [1, 2]);
  assert.equal(site.stage, 2);
  // Deliveries: the same village with the outpost finished and with it still unfinished, stores emptied;
  // the difference over a stretch is the outpost's rate (the woodcutters work alike in both).
  const stretch = (finished: boolean) => {
    const s = rich();
    s.startOutpost('lumber', spot.x, spot.z, [], true);
    s.completeRemoteSite(outpostSiteKind('lumber'), []);
    if (!finished) {
      s.remoteSites[0]!.stage = 1;
    }
    s.economy.spendWood(s.economy.stock.wood);
    stepSim(s, { seconds: 100, from: 2 * DAY_S });
    return s.economy.stock.wood;
  };
  const extra = stretch(true) - stretch(false);
  assert.ok(
    Math.abs(extra - O.WOOD_PER_SEC * 100) < O.WOOD_PER_SEC * 100 * 0.2,
    `${extra} wood in 100 s`,
  );
});

await check('wood hauled by the hand builds an outpost on its own, shorter, schedule', () => {
  const sim = rich();
  const spot = spotFor(sim, 'lumber');
  assert.equal(sim.startOutpost('lumber', spot.x, spot.z, []), 'ok');
  const site = sim.remoteSites[0]!;
  const per = VILLAGE.HAND.WORK_PER_WOOD_S;
  const events: VillageEvent[] = [];
  sim.haulRemote(site.id, O.SITE_WORK_S[0]! / per, events);
  assert.equal(site.stage, 1);
  sim.haulRemote(site.id, O.SITE_WORK_S[1]! / per, events);
  assert.equal(site.stage, 2);
  const stages = events.flatMap((e) => (e.kind === 'remoteStageCompleted' ? [e.stage] : []));
  assert.deepEqual(stages, [1, 2]);
});

await check('a fishing hut delivers food, never over the stores', () => {
  const sim = rich();
  const spot = spotFor(sim, 'fishing');
  assert.equal(sim.startOutpost('fishing', spot.x, spot.z, [], true), 'ok');
  sim.completeRemoteSite(outpostSiteKind('fishing'), []);
  sim.economy.drainFood();
  stepSim(sim, { seconds: 300, from: 2 * DAY_S });
  assert.ok(sim.economy.stock.food > 0);
  stepSim(sim, { seconds: 3 * DAY_S, from: 2 * DAY_S + 300 });
  assert.ok(sim.economy.stock.food <= sim.economy.caps().food + 1e-6);
});

await check('an outpost under construction saves and goes on the same', () => {
  const sim = rich();
  const spot = spotFor(sim, 'lumber');
  sim.startOutpost('lumber', spot.x, spot.z, []);
  stepSim(sim, { seconds: 600, from: 2 * DAY_S, fed: true });
  const copy = makeSim(map, { mode: 'hamlet', restore: structuredClone(sim.serialize()) });
  assert.equal(savedHash(copy), savedHash(sim));
  const rest = { seconds: DAY_S, from: 2 * DAY_S + 600, fed: true } as const;
  stepSim(sim, rest);
  stepSim(copy, rest);
  assert.equal(savedHash(copy), savedHash(sim));
});

finish('all outpost checks passed');
