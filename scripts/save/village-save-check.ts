// scripts/save/village-save-check.ts — headless round trip of the village sim's save state
//
// A village is run continuously for N + M hours. Another is run N hours, saved (through a structured
// clone, like IndexedDB does), restored into a fresh sim and run M more. The two must end in the same
// state, with the same events along the way: that only holds when the save holds everything the future
// depends on.
//
//   node --experimental-strip-types scripts/save/village-save-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../src/config/village.ts';
import { gameSnapshotProblem } from '../../src/save/bootSave.ts';
import { captureGame } from '../../src/save/gameSave.ts';
import { SAVE_VERSION } from '../../src/save/snapshot.ts';
import type { VillageEvent } from '../../src/world/village/model/types.ts';
import type { VillageSim } from '../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { fakeGame } from '../lib/saveFixtures.ts';
import { DAY_S, type LoadedMap, loadMap, makeSim } from '../lib/villageHeadless.ts';

const DT = 0.1;

/** Path of the first difference between two saved states, for a readable failure. */
function firstDiff(a: unknown, b: unknown, path = 'state'): string | null {
  if (Object.is(a, b)) return null;
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const x = a as unknown as ArrayLike<number>;
    const y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length) return `${path}: length ${x.length} vs ${y.length}`;
    for (let i = 0; i < x.length; i++) {
      if (!Object.is(x[i], y[i])) return `${path}[${i}]: ${x[i]} vs ${y[i]}`;
    }
    return null;
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const d = firstDiff((a as any)[key], (b as any)[key], `${path}.${key}`);
      if (d) return d;
    }
    return null;
  }
  return `${path}: ${String(a)} vs ${String(b)}`;
}

const sameState = (a: unknown, b: unknown, what: string) => {
  const d = firstDiff(a, b);
  assert.equal(d, null, `${what}: first difference at ${d}`);
};

const describe = (e: VillageEvent) => {
  if (e.kind === 'fieldStarted') return `field:${e.field.id}`;
  if (e.kind === 'villagerConverted') return `convert:${e.villager}:${e.converts}`;
  if (e.kind === 'villageConverted') return 'village-converted';
  if (e.kind === 'hunger') return `hunger:${e.stage}`;
  if (e.kind === 'villagerDying') return `dying:${e.villager}`;
  if (e.kind === 'villagerDied') return `died:${e.villager}:${e.moved}`;
  if (e.kind === 'treeFelled') return `felled:${e.tree}`;
  if (e.kind === 'treeStump') return `stump:${e.tree}`;
  if (e.kind === 'treeSapling') return `sapling:${e.tree}`;
  if (e.kind === 'treeGrown') return `grown:${e.tree}`;
  if (e.kind === 'graveAdded') return `grave:${e.grave.x.toFixed(2)}:${e.grave.z.toFixed(2)}`;
  return `${e.kind}:${e.building.id}:${e.kind === 'stageCompleted' ? e.stage : ''}`;
};

/** Advance a sim from `fromH` to `toH` hours of village time; returns the events, in order. A script acts at given steps. */
function run(
  sim: VillageSim,
  fromH: number,
  toH: number,
  script?: (step: number, events: VillageEvent[]) => void,
  /** Keep the wood and food stores full (a map whose terrain cannot feed or build a village by itself). */
  fed = false,
  /** Rain 0..1 at a given step (default none). */
  rain?: (step: number) => number,
): string[] {
  const log: string[] = [];
  const events: VillageEvent[] = [];
  const from = Math.round((fromH * 3600) / DT);
  const to = Math.round((toH * 3600) / DT);
  for (let k = from; k < to; k++) {
    script?.(k, events);
    if (fed) {
      sim.economy.addWood(Number.POSITIVE_INFINITY);
      sim.economy.addFood(Number.POSITIVE_INFINITY);
    }
    sim.beginStep();
    sim.update(
      DT,
      {
        playerDistM: 10,
        presenceActive: true,
        dayPhase: (0.3 + (k * DT) / DAY_S) % 1,
        vigil: false,
        rain01: rain?.(k) ?? 0,
      },
      events,
    );
    for (const e of events) log.push(describe(e));
    events.length = 0;
  }
  return log;
}

interface Target {
  name: string;
  mapId: string;
  seed?: { x: number; z: number; rotY: number };
  /** The map has no fields, so the village is fed by hand to grow at all. */
  fed?: boolean;
}
const TARGETS: Target[] = [
  { name: 'island-mountain', mapId: 'island-mountain' },
  // Has trees and shore spots, so woodcutters and fishermen hold work spots.
  { name: 'dala (trees and shore)', mapId: 'dala', seed: { x: 300, z: -60, rotY: 0 }, fed: true },
];

const make = (map: LoadedMap, restore?: ReturnType<VillageSim['serialize']>) =>
  makeSim(map, { restore });

/** (hours before the save, hours after): right after founding, mid-growth, well into the village. */
const SPLITS: [number, number][] = [
  [0.02, 0.5],
  [1, 1],
  [3, 1],
];

// `quick` runs one case (about 10 s) instead of all of them.
const quick = process.argv[2] === 'quick';

for (const target of quick ? TARGETS.slice(0, 1) : TARGETS) {
  const map = loadMap(target.mapId, target.seed);

  for (const [before, after] of quick ? [SPLITS[1]!] : SPLITS) {
    await check(
      `${target.name}: save at ${before} h, continue ${after} h equals running straight on`,
      () => {
        const straight = make(map);
        const straightLog = run(straight, 0, before + after, undefined, target.fed);

        const first = make(map);
        const firstLog = run(first, 0, before, undefined, target.fed);
        const saved = first.serialize();
        const stored = structuredClone(saved); // what a store hands back

        // serialize copies: running on must not change what was saved
        const firstLogAfter = run(first, before, before + after, undefined, target.fed);
        sameState(saved, stored, 'the saved state changed when the sim ran on');
        sameState(
          first.serialize(),
          straight.serialize(),
          'serializing disturbed the original run',
        );

        const resumed = make(map, stored);
        sameState(resumed.serialize(), stored, 'restoring and serializing again');
        const resumedLog = run(resumed, before, before + after, undefined, target.fed);

        assert.deepEqual(firstLog.concat(resumedLog).length, straightLog.length);
        assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
        sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
        // Wood and housing pressure set the pace now (M4): two hours build about a dozen.
        assert.ok(straight.buildings.length > (before > 0.5 ? 10 : 2), 'the run built a village');
      },
    );
  }
}

// A hamlet: nobody believes until a script raises belief at fixed steps, so a save made before, between
// and after the conversion must all continue exactly like the run that was never saved.
const HOUR_STEPS = Math.round(3600 / DT);
const beliefScript = (sim: VillageSim) => (step: number, events: VillageEvent[]) => {
  const n = sim.villagers.count;
  if (step === Math.round(0.1 * HOUR_STEPS)) {
    for (let i = 0; i < 4; i++) sim.addBelief((sim.elder + 1 + i) % n, 1, events);
  }
  if (step === Math.round(0.4 * HOUR_STEPS)) sim.addBelief(sim.elder, 0.6, events);
  if (step === Math.round(0.6 * HOUR_STEPS)) {
    sim.addBelief(sim.elder, 0.6, events);
    for (let i = 5; i < 9; i++) sim.addBelief((sim.elder + i) % n, 1, events);
    sim.convertVillage(events);
  }
};
const makeHamlet = (map: LoadedMap, restore?: ReturnType<VillageSim['serialize']>) =>
  makeSim(map, { mode: 'hamlet', restore });

const HAMLET_SPLITS: [number, number][] = [
  [0.05, 1.5],
  [0.5, 1],
  [1, 1],
];
for (const [before, after] of quick ? [HAMLET_SPLITS[1]!] : HAMLET_SPLITS) {
  await check(
    `hamlet (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('island-mountain');
      const straight = makeHamlet(map);
      const straightLog = run(straight, 0, before + after, beliefScript(straight));
      assert.ok(straightLog.includes('village-converted'), 'the script converts the village');

      const first = makeHamlet(map);
      const firstLog = run(first, 0, before, beliefScript(first));
      const saved = first.serialize();
      const stored = structuredClone(saved);
      const firstLogAfter = run(first, before, before + after, beliefScript(first));
      sameState(saved, stored, 'the saved state changed when the sim ran on');

      const resumed = makeHamlet(map, stored);
      assert.equal(resumed.converted, saved.converted);
      assert.equal(resumed.elder, saved.elder);
      sameState(resumed.serialize(), stored, 'restoring and serializing again');
      const resumedLog = run(resumed, before, before + after, beliefScript(resumed));
      assert.equal(firstLog.concat(resumedLog).length, straightLog.length);
      assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
      sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
    },
  );
}

// A famine: no food is made, so the village weakens and loses people. A save taken while people are
// dying, dead and buried must continue exactly like the run that was never saved (the pool's removals,
// the claims rebuilt from it, the elder, the graveyard and the hunger clock all come back).
const withNoFood = <T>(fn: () => T): T => {
  const e = VILLAGE.ECONOMY as { FIELD_YIELD: number; FISH_PER_SEC: number };
  const saved: [number, number] = [e.FIELD_YIELD, e.FISH_PER_SEC];
  e.FIELD_YIELD = 0;
  e.FISH_PER_SEC = 0;
  try {
    return fn();
  } finally {
    [e.FIELD_YIELD, e.FISH_PER_SEC] = saved;
  }
};
const famineScript = (sim: VillageSim) => (step: number, events: VillageEvent[]) => {
  if (step === 0) {
    for (let i = 0; i < sim.villagers.count; i++) sim.addBelief(i, 1, events);
    sim.convertVillage(events);
    sim.economy.drainFood();
  }
};
const FAMINE_SPLITS: [number, number][] = [
  [1.0, 1.4],
  [1.6, 0.8],
];
for (const [before, after] of quick ? [FAMINE_SPLITS[0]!] : FAMINE_SPLITS) {
  await check(
    `famine (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () =>
      withNoFood(() => {
        const map = loadMap('island-mountain');
        const straight = makeHamlet(map);
        const straightLog = run(straight, 0, before + after, famineScript(straight));
        assert.ok(
          straightLog.some((e) => e.startsWith('died:')),
          'people died',
        );
        assert.ok(
          straightLog.some((e) => e.startsWith('grave:')),
          'and were buried',
        );

        const first = makeHamlet(map);
        const firstLog = run(first, 0, before, famineScript(first));
        const saved = first.serialize();
        const stored = structuredClone(saved);
        const firstLogAfter = run(first, before, before + after, famineScript(first));
        sameState(saved, stored, 'the saved state changed when the sim ran on');

        const resumed = makeHamlet(map, stored);
        assert.equal(resumed.villagers.count, saved.villagers.count);
        assert.equal(resumed.graves.length, saved.graveyard.graves.length);
        sameState(resumed.serialize(), stored, 'restoring and serializing again');
        const resumedLog = run(resumed, before, before + after, famineScript(resumed));
        assert.equal(firstLog.concat(resumedLog).length, straightLog.length);
        assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
        sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
      }),
  );
}

// A forest at work: woodcutters (and the DEV fell, away from the village so stumps may regrow) bring trees down, the village spends the wood, stumps
// turn to saplings and saplings to trees. A save taken with trees falling, stumped, regrowing and half
// chopped must continue exactly like the run that was never saved.
const forestScript = (sim: VillageSim) => (step: number, events: VillageEvent[]) => {
  if (step === 0) sim.fellNear(450, -60, 6, events);
  sim.economy.addFood(Number.POSITIVE_INFINITY);
  if (step % 300 === 0) sim.economy.spendWood(Math.min(8, sim.economy.stock.wood));
};
const FOREST_SPLITS: [number, number][] = [
  [0.0005, 2],
  [0.4, 1.6],
  [1.3, 0.7],
];
for (const [before, after] of quick ? [FOREST_SPLITS[1]!] : FOREST_SPLITS) {
  await check(
    `forest (dala): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('dala', { x: 300, z: -60, rotY: 0 });
      const straight = make(map);
      const straightLog = run(straight, 0, before + after, forestScript(straight));
      assert.ok(
        straightLog.filter((e) => e.startsWith('felled:')).length > 6,
        'trees were felled beyond the DEV ones',
      );
      assert.ok(
        straightLog.some((e) => e.startsWith('sapling:')),
        'stumps turned to saplings',
      );

      const first = make(map);
      const firstLog = run(first, 0, before, forestScript(first));
      const saved = first.serialize();
      const stored = structuredClone(saved);
      const firstLogAfter = run(first, before, before + after, forestScript(first));
      sameState(saved, stored, 'the saved state changed when the sim ran on');

      const resumed = make(map, stored);
      sameState(resumed.serialize(), stored, 'restoring and serializing again');
      const resumedLog = run(resumed, before, before + after, forestScript(resumed));
      assert.equal(firstLog.concat(resumedLog).length, straightLog.length);
      assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
      sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
    },
  );
}

// Days of meals, mourning and rain: a save taken while people are at table, sheltering from the rain or
// standing at the graves must continue exactly like the run that was never saved.
const rainScript = (k: number) => {
  const h = k / HOUR_STEPS;
  return (h >= 0.2 && h < 0.3) || (h >= 0.7 && h < 0.75) ? 0.6 : h >= 0.3 && h < 0.35 ? 0.2 : 0;
};
const mournScript = (sim: VillageSim) => (step: number, events: VillageEvent[]) => {
  if (step === Math.round(0.05 * HOUR_STEPS)) sim.killOne(events);
};
const DAY_SPLITS: [number, number][] = [
  [0.25, 0.75],
  [0.72, 0.6],
  [1.1, 0.5],
];
for (const [before, after] of quick ? [DAY_SPLITS[0]!] : DAY_SPLITS) {
  await check(
    `days of meals, rain and mourning (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('island-mountain');
      const script = (sim: VillageSim) => mournScript(sim);
      const straight = makeHamlet(map);
      const straightLog = run(straight, 0, before + after, script(straight), true, rainScript);
      assert.ok(
        straightLog.some((e) => e.startsWith('grave:')),
        'someone was buried, so the priests had graves to mourn at',
      );

      const first = makeHamlet(map);
      const firstLog = run(first, 0, before, script(first), true, rainScript);
      const saved = first.serialize();
      const stored = structuredClone(saved);
      const firstLogAfter = run(first, before, before + after, script(first), true, rainScript);
      sameState(saved, stored, 'the saved state changed when the sim ran on');

      const resumed = makeHamlet(map, stored);
      sameState(resumed.serialize(), stored, 'restoring and serializing again');
      const resumedLog = run(resumed, before, before + after, script(resumed), true, rainScript);
      assert.equal(firstLog.concat(resumedLog).length, straightLog.length);
      assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
      sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
    },
  );
}

// Blessings: a field, a house and a tree sped up, running out at different times, with a site kindled on the
// way. A save taken while they run must continue exactly like the run that was never saved.
const blessScript = (sim: VillageSim) => (step: number, events: VillageEvent[]) => {
  if (step === Math.round(0.05 * HOUR_STEPS)) {
    const house = sim.buildings.find((b) => b.type.startsWith('house_') && b.stage >= 2)!;
    sim.bless('field', sim.fields[0]!.id, 200);
    sim.bless('house', house.id, 400);
    sim.bless('tree', 40, 600);
  }
  if (step === Math.round(0.2 * HOUR_STEPS)) {
    sim.startSiteNow(events);
    const site = sim.buildings.find((b) => b.stage < 2);
    if (site) sim.kindle(site.id, events);
    sim.provide(5);
  }
};
const BLESS_SPLITS: [number, number][] = [
  [0.1, 0.6],
  [0.2, 0.5],
];
for (const [before, after] of quick ? [BLESS_SPLITS[0]!] : BLESS_SPLITS) {
  await check(
    `blessings and kindled sites (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('island-mountain');
      const script = (sim: VillageSim) => blessScript(sim);
      const straight = makeHamlet(map);
      const straightLog = run(straight, 0, before + after, script(straight), true);
      const first = makeHamlet(map);
      const firstLog = run(first, 0, before, script(first), true);
      assert.ok(first.blessings.length > 0, 'blessings were running at the save');
      const saved = first.serialize();
      const stored = structuredClone(saved);
      const firstLogAfter = run(first, before, before + after, script(first), true);
      sameState(saved, stored, 'the saved state changed when the sim ran on');

      const resumed = makeHamlet(map, stored);
      assert.deepEqual(resumed.blessings, saved.blessings);
      sameState(resumed.serialize(), stored, 'restoring and serializing again');
      const resumedLog = run(resumed, before, before + after, script(resumed), true);
      assert.equal(firstLog.concat(resumedLog).length, straightLog.length);
      assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
      sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
    },
  );
}

await check('restore refuses a hamlet save whose elder or conversion flag is damaged', () => {
  const map = loadMap('island-mountain');
  const saved = makeHamlet(map).serialize();
  assert.throws(() => makeHamlet(map, { ...saved, elder: 999 }), /elder/);
  assert.throws(() => makeHamlet(map, { ...saved, elder: -2 }), /elder/);
  assert.throws(
    () => makeHamlet(map, { ...saved, converted: 'yes' as unknown as boolean }),
    /converted/,
  );
  const noBelief = { ...saved.villagers } as Record<string, unknown>;
  delete noBelief.belief;
  assert.throws(() => makeHamlet(map, { ...saved, villagers: noBelief as never }), /belief/);
});

await check('restore refuses a save made for another village seed', () => {
  const map = loadMap('island-mountain');
  const saved = make(map).serialize();
  assert.throws(() => make(map, { ...saved, seedId: saved.seedId + 1 }), /different village seed/);
});

await check('restore refuses a save that does not fit the map or the pool', () => {
  const map = loadMap('island-mountain');
  const saved = make(map).serialize();
  assert.throws(
    () => make(map, { ...saved, occupant: new Int32Array(saved.occupant.length - 1) }),
    /does not fit the map/,
  );
  assert.throws(
    () => make(map, { ...saved, villagers: { ...saved.villagers, count: 1_000_000 } }),
    /does not fit the pool/,
  );
  const short = { ...saved.villagers, x: saved.villagers.x.slice(1) };
  assert.throws(() => make(map, { ...saved, villagers: short }), /wrong length/);
});

await check('game snapshot check: accepts a matching village and refuses every mismatch', () => {
  const map = loadMap('island-mountain');
  const sim = make(map);
  run(sim, 0, 0.05);
  const parts = captureGame(
    fakeGame({
      game: { energy: 10, energyCap: 100, orbsAbsorbed: 1, phase: 0, memoryFragments: [] },
      village: { sim },
      playSeconds: () => 100,
    }),
  );
  const snapshot = (over: Record<string, unknown> = {}) =>
    structuredClone({
      version: SAVE_VERSION,
      savedAt: 1,
      playSeconds: parts.playSeconds,
      mapId: 'island-mountain',
      summary: parts.summary,
      profile: parts.profile,
      village: parts.village,
      ...over,
    }) as any;

  assert.equal(gameSnapshotProblem(snapshot(), map.seed), null);
  assert.match(
    gameSnapshotProblem(snapshot(), { ...map.seed, id: map.seed.id + 1 })!,
    /different village seed/,
  );
  assert.match(
    gameSnapshotProblem(snapshot(), { ...map.seed, radiusM: map.seed.radiusM + 40 })!,
    /does not fit this map/,
  );
  assert.match(gameSnapshotProblem(snapshot(), null)!, /village but this map has none/);
  assert.match(
    gameSnapshotProblem(snapshot({ village: {} }), map.seed)!,
    /no village but this map has one/,
  );
  assert.match(gameSnapshotProblem(snapshot({ village: { sim: null } }), map.seed)!, /damaged/);
  const shortWear = snapshot();
  shortWear.village.sim.wear.data = shortWear.village.sim.wear.data.slice(1);
  assert.match(gameSnapshotProblem(shortWear, map.seed)!, /does not fit/);
  const noPlayer = snapshot();
  noPlayer.profile.player = null;
  assert.match(gameSnapshotProblem(noPlayer, map.seed)!, /player position/);
});

finish('all village save checks passed');
