// scripts/checks/village/remote-site-check.ts — a crew of builders restores a place far outside the village grid:
// out along the route, a camp through the night, work, and home again; and the save carries a trip in progress.
// Run: node --experimental-strip-types scripts/checks/village/remote-site-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { CrewPhase, type VillageEvent } from '../../../src/world/village/model/types.ts';
import { findCoarseRoute } from '../../../src/world/village/sim/coarseRoute.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import {
  convertVillage,
  DAY_S,
  dayPhaseAt,
  loadMap,
  makeSim,
  savedHash,
  stepSim,
} from '../lib/villageHeadless.ts';

const map = loadMap('island-mountain');
const { seed, sampler } = map;
const { CREW } = VILLAGE.RESTORATION;

/** A place on foot from the village, a few minutes out. */
function farPlace(): { x: number; z: number } {
  for (const r of [300, 400, 250, 350]) {
    for (let b = 0; b < 12; b++) {
      const a = (b / 12) * Math.PI * 2;
      const x = seed.x + Math.sin(a) * r;
      const z = seed.z + Math.cos(a) * r;
      const route = findCoarseRoute(sampler, seed.x, seed.z, x, z);
      if (route && route.walkMinutes > 3) return { x, z };
    }
  }
  throw new Error('no place to walk to on the map');
}
const place = farPlace();

/** A grown, converted village (two days of hand-fed growth), made once and restored from for each check. */
const grown = (() => {
  const sim = convertVillage(makeSim(map, { mode: 'hamlet' }));
  stepSim(sim, { seconds: 2 * DAY_S, fed: true });
  return sim.serialize();
})();
const grownVillage = (): VillageSim =>
  makeSim(map, { mode: 'hamlet', restore: structuredClone(grown) });

const crewOf = (sim: VillageSim): number[] => {
  const { villagers: p } = sim;
  return Array.from({ length: p.count }, (_, i) => i).filter((i) => p.crew[i]! > 0);
};

await check('a hamlet that has not converted has no builders to send', () => {
  const sim = makeSim(map, { mode: 'hamlet' });
  assert.equal(sim.startRemoteSite('tree', place.x, place.z, []), 'no-crew');
  assert.equal(sim.remoteSites.length, 0);
});

await check('a place that cannot be walked to is refused, and a place is begun once', () => {
  const sim = grownVillage();
  assert.equal(sim.startRemoteSite('tree', seed.x + 6000, seed.z, []), 'no-route');
  assert.equal(sim.startRemoteSite('tree', place.x, place.z, []), 'ok');
  assert.equal(sim.startRemoteSite('tree', place.x, place.z, []), 'busy');
});

await check('the crew walks out, camps through the night, finishes the work and walks home', () => {
  const sim = grownVillage();
  const start: VillageEvent[] = [];
  assert.equal(sim.startRemoteSite('tree', place.x, place.z, start), 'ok');
  assert.ok(start.some((e) => e.kind === 'remoteStarted'));
  const site = sim.remoteSites[0]!;
  const p = sim.villagers;
  const crew = crewOf(sim);
  assert.ok(crew.length >= CREW.MIN && crew.length <= CREW.MAX, `crew of ${crew.length}`);
  const fromS = 2 * DAY_S;
  let atCamp = 0;
  const arrived = new Set<number>();
  let nightAtCamp = 0;
  let nightSamples = 0;
  let nanSeen = false;
  let doneAtS = -1;
  const stages: number[] = [];
  stepSim(sim, {
    seconds: 4 * DAY_S,
    from: fromS,
    fed: true,
    onStep: (t, events) => {
      for (const e of events) {
        if (e.kind === 'remoteStageCompleted') {
          stages.push(e.stage);
          if (e.stage === 2) doneAtS = t;
        }
      }
      for (const i of crew) {
        if (!Number.isFinite(p.x[i]!) || !Number.isFinite(p.z[i]!)) nanSeen = true;
      }
      if (Math.round(t * 10) % 50 !== 0) return;
      const phase = dayPhaseAt(t);
      const night = phase > 0.8 || phase < 0.2;
      for (const i of crew) {
        if (p.crew[i] === 0) continue;
        const d = Math.hypot(p.x[i]! - site.campX, p.z[i]! - site.campZ);
        if (p.crewPhase[i] === CrewPhase.Camp) {
          arrived.add(i);
          atCamp++;
          assert.ok(d < 8, `a camped builder stands ${d.toFixed(0)} m from the camp`);
        }
        if (night && site.stage < 2 && arrived.has(i)) {
          nightSamples++;
          if (p.crewPhase[i] === CrewPhase.Camp) nightAtCamp++;
        }
      }
    },
  });
  assert.ok(!nanSeen, 'no builder left the world');
  assert.deepEqual(stages, [1, 2], 'both stages are reported, in order');
  assert.ok(atCamp > 0, 'the crew reached the camp');
  assert.ok(nightSamples > 0 && nightAtCamp === nightSamples, 'they stay at the camp at night');
  assert.ok(
    doneAtS > 0 && doneAtS - fromS < 3 * DAY_S,
    `finished on day ${((doneAtS - fromS) / DAY_S).toFixed(1)}`,
  );
  assert.equal(crewOf(sim).length, 0, 'the crew is released after the walk home');
  for (const i of crew) {
    const d = Math.hypot(p.x[i]! - seed.x, p.z[i]! - seed.z);
    assert.ok(d < seed.radiusM + 20, `builder ${i} is home (${d.toFixed(0)} m from the temple)`);
  }
});

await check('a trip in progress survives a save and a load', () => {
  const sim = grownVillage();
  sim.startRemoteSite('tree', place.x, place.z, []);
  const splitS = 2 * DAY_S + 120;
  // Two minutes in, the crew is still on its way.
  stepSim(sim, { seconds: 120, from: 2 * DAY_S, fed: true });
  assert.ok(
    crewOf(sim).some((i) => sim.villagers.crewPhase[i] !== CrewPhase.Camp),
    'someone is still walking',
  );
  const state = structuredClone(sim.serialize());
  const copy = makeSim(map, { mode: 'hamlet', restore: state });
  assert.equal(savedHash(copy), savedHash(sim), 'the load is the save');
  const rest = { seconds: DAY_S + 600, from: splitS, fed: true } as const;
  stepSim(sim, rest);
  stepSim(copy, rest);
  assert.equal(savedHash(copy), savedHash(sim), 'both carry on the same');
  assert.ok(copy.remoteSites[0]!.stage >= 1, 'the work went on after the load');
});

await check('a crew is made up again when its members are lost', () => {
  const sim = grownVillage();
  sim.startRemoteSite('tree', place.x, place.z, []);
  const first = crewOf(sim);
  // They die one by one (as if of hunger): free builders take their place.
  const events: VillageEvent[] = [];
  for (const i of first.slice(0, first.length - 1)) sim.villagers.dying[i] = 1e-3;
  stepSim(sim, {
    seconds: 60,
    from: 2 * DAY_S,
    fed: true,
    onStep: (_t, e) => void events.push(...e),
  });
  const now = crewOf(sim).filter((i) => sim.villagers.dying[i] === 0);
  assert.ok(now.length >= CREW.MIN, `crew of ${now.length} after losses`);
});

finish('all remote site checks passed');
