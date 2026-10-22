// scripts/checks/save/village-save-check.ts — headless round trip of the village sim's save state
//
// A village is run continuously for N + M hours. Another is run N hours, saved (through a structured
// clone, like IndexedDB does), restored into a fresh sim and run M more. The two must end in the same
// state, with the same events along the way: that only holds when the save holds everything the future
// depends on.
//
// By default each scenario runs one split; --full runs them all (much slower).
//
//   node --experimental-strip-types --no-warnings scripts/checks/save/village-save-check.ts [--full]
import assert from 'node:assert/strict';
import { gameSnapshotProblem } from '../../../src/save/bootSave.ts';
import { captureGame } from '../../../src/save/gameSave.ts';
import { SAVE_VERSION } from '../../../src/save/snapshot.ts';
import type { VillageEvent } from '../../../src/world/village/model/types.ts';
import type { VillageSim } from '../../../src/world/village/sim/villageSim.ts';
import { check, finish } from '../lib/check.ts';
import { fakeGame } from '../lib/saveFixtures.ts';
import {
  DT,
  dayPhaseAt,
  type LoadedMap,
  loadMap,
  makeSim,
  withNoFood,
} from '../lib/villageHeadless.ts';

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
  if (e.kind === 'remoteStarted') return `remote:${e.site.id}`;
  if (e.kind === 'remoteStageCompleted') return `remote:${e.site.id}:${e.stage}`;
  if (e.kind === 'villagerHeartened') return `heartened:${e.villager}`;
  if (e.kind === 'prayerOpened' || e.kind === 'prayerAnswered' || e.kind === 'prayerLapsed') {
    return `${e.kind}:${e.villager}:${e.need}`;
  }
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
        dayPhase: dayPhaseAt(k * DT),
        vigil: false,
        rain01: rain?.(k) ?? 0,
        gathering: false,
      },
      events,
    );
    for (const e of events) log.push(describe(e));
    events.length = 0;
  }
  return log;
}

const make = (map: LoadedMap, restore?: ReturnType<VillageSim['serialize']>) =>
  makeSim(map, { restore });

/** (hours before the save, hours after): right after founding, mid-growth, well into the village. */
const SPLITS: [number, number][] = [
  [0.02, 0.5],
  [1, 1],
  [3, 1],
];

// Default: one split per scenario. `--full` runs every split.
const full = process.argv.includes('--full');
/** All the splits with --full, otherwise the one at `index`. */
const splitsOf = (all: [number, number][], index: number) => (full ? all : [all[index]!]);

interface RoundTrip {
  /** A fresh sim, or one restored from a stored state. */
  make: (restore?: ReturnType<VillageSim['serialize']>) => VillageSim;
  before: number;
  after: number;
  /** Acts at given steps of a run (belief, deaths, blessings...). */
  script?: (sim: VillageSim) => (step: number, events: VillageEvent[]) => void;
  fed?: boolean;
  rain?: (step: number) => number;
  /** Looks at the run that was never saved. */
  onStraight?: (straight: VillageSim, log: string[]) => void;
  /** Looks at the state at the save, the stored copy and the restored sim. */
  onSave?: (
    first: VillageSim,
    saved: ReturnType<VillageSim['serialize']>,
    resumed: VillageSim,
  ) => void;
}

/** The save-and-continue scenario: a run saved at `before` h and carried on equals the run that never stopped. */
function roundTrip(o: RoundTrip): void {
  const go = (sim: VillageSim, from: number, to: number) =>
    run(sim, from, to, o.script?.(sim), o.fed, o.rain);
  const total = o.before + o.after;
  const straight = o.make();
  const straightLog = go(straight, 0, total);
  o.onStraight?.(straight, straightLog);

  const first = o.make();
  const firstLog = go(first, 0, o.before);
  const saved = first.serialize();
  const stored = structuredClone(saved); // what a store hands back
  // serialize copies: running on must not change what was saved
  const firstLogAfter = go(first, o.before, total);
  sameState(saved, stored, 'the saved state changed when the sim ran on');
  sameState(first.serialize(), straight.serialize(), 'serializing disturbed the original run');

  const resumed = o.make(stored);
  sameState(resumed.serialize(), stored, 'restoring and serializing again');
  o.onSave?.(first, saved, resumed);
  const resumedLog = go(resumed, o.before, total);
  assert.equal(firstLog.concat(resumedLog).length, straightLog.length);
  assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
  sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
}

// A plain village grows, and a save at any point continues like the run that never stopped.
for (const [before, after] of splitsOf(SPLITS, 1)) {
  await check(
    `island-mountain: save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('island-mountain');
      roundTrip({
        make: (restore) => make(map, restore),
        before,
        after,
        onStraight: (straight) =>
          // Wood and housing pressure set the pace now: two hours build about a dozen.
          assert.ok(straight.buildings.length > (before > 0.5 ? 10 : 2), 'the run built a village'),
      });
    },
  );
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
for (const [before, after] of splitsOf(HAMLET_SPLITS, 1)) {
  await check(
    `hamlet (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('island-mountain');
      roundTrip({
        make: (restore) => makeHamlet(map, restore),
        before,
        after,
        script: beliefScript,
        onStraight: (_sim, log) =>
          assert.ok(log.includes('village-converted'), 'the script converts the village'),
        onSave: (_first, saved, resumed) => {
          assert.equal(resumed.converted, saved.converted);
          assert.equal(resumed.elder, saved.elder);
          assert.equal(resumed.aera, saved.aera);
        },
      });
    },
  );
}

// A famine: no food is made, so the village weakens and loses people. A save taken while people are
// dying, dead and buried must continue exactly like the run that was never saved (the pool's removals,
// the claims rebuilt from it, the elder, the graveyard and the hunger clock all come back).
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
for (const [before, after] of splitsOf(FAMINE_SPLITS, 0)) {
  await check(
    `famine (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () =>
      withNoFood(() => {
        const map = loadMap('island-mountain');
        roundTrip({
          make: (restore) => makeHamlet(map, restore),
          before,
          after,
          script: famineScript,
          onStraight: (_sim, log) => {
            assert.ok(
              log.some((e) => e.startsWith('died:')),
              'people died',
            );
            assert.ok(
              log.some((e) => e.startsWith('grave:')),
              'and were buried',
            );
          },
          onSave: (_first, saved, resumed) => {
            assert.equal(resumed.villagers.count, saved.villagers.count);
            assert.equal(resumed.graves.length, saved.graveyard.graves.length);
          },
        });
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
for (const [before, after] of splitsOf(FOREST_SPLITS, 1)) {
  await check(
    `forest (dala): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('dala', { x: 300, z: -60, rotY: 0 });
      roundTrip({
        make: (restore) => make(map, restore),
        before,
        after,
        script: forestScript,
        onStraight: (_sim, log) => {
          assert.ok(
            log.filter((e) => e.startsWith('felled:')).length > 6,
            'trees were felled beyond the DEV ones',
          );
          assert.ok(
            log.some((e) => e.startsWith('sapling:')),
            'stumps turned to saplings',
          );
        },
      });
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
for (const [before, after] of splitsOf(DAY_SPLITS, 0)) {
  await check(
    `days of meals, rain and mourning (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('island-mountain');
      roundTrip({
        make: (restore) => makeHamlet(map, restore),
        before,
        after,
        script: mournScript,
        fed: true,
        rain: rainScript,
        onStraight: (_sim, log) =>
          assert.ok(
            log.some((e) => e.startsWith('grave:')),
            'someone was buried, so the priests had graves to mourn at',
          ),
      });
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
for (const [before, after] of splitsOf(BLESS_SPLITS, 0)) {
  await check(
    `blessings and kindled sites (island-mountain): save at ${before} h, continue ${after} h equals running straight on`,
    () => {
      const map = loadMap('island-mountain');
      roundTrip({
        make: (restore) => makeHamlet(map, restore),
        before,
        after,
        script: blessScript,
        fed: true,
        onSave: (_first, saved, resumed) => {
          assert.ok(saved.blessings.length > 0, 'blessings were running at the save');
          assert.deepEqual(resumed.blessings, saved.blessings);
        },
      });
    },
  );
}

await check('restore refuses a hamlet save whose elder, Aera or conversion flag is damaged', () => {
  const map = loadMap('island-mountain');
  const saved = makeHamlet(map).serialize();
  assert.throws(() => makeHamlet(map, { ...saved, elder: 999 }), /elder/);
  assert.throws(() => makeHamlet(map, { ...saved, elder: -2 }), /elder/);
  assert.throws(() => makeHamlet(map, { ...saved, aera: 999 }), /Aera/);
  assert.throws(() => makeHamlet(map, { ...saved, aera: -2 }), /Aera/);
  assert.throws(
    () => makeHamlet(map, { ...saved, elder: 0, aera: 0 }),
    /same villager/,
    'Aera is never the elder',
  );
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
