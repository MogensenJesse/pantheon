// scripts/save/village-save-check.ts — headless round trip of the village sim's save state
//
// A village is run continuously for N + M hours. Another is run N hours, saved (through a structured
// clone, like IndexedDB does), restored into a fresh sim and run M more. The two must end in the same
// state, with the same events along the way: that only holds when the save holds everything the future
// depends on.
//
//   node --experimental-strip-types scripts/save/village-save-check.ts
import assert from 'node:assert/strict';
import { gameSnapshotProblem } from '../../src/save/bootSave.ts';
import { captureGame } from '../../src/save/gameSave.ts';
import { SAVE_VERSION } from '../../src/save/snapshot.ts';
import type { VillageEvent } from '../../src/world/village/model/types.ts';
import { createVillageSim, type VillageSim } from '../../src/world/village/sim/villageSim.ts';
import { DAY_S, type LoadedMap, loadMap } from '../lib/villageHeadless.ts';

const DT = 0.1;

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  const t0 = performance.now();
  try {
    await fn();
    console.log(`ok   ${name} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

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
  return `${e.kind}:${e.building.id}:${e.kind === 'stageCompleted' ? e.stage : ''}`;
};

/** Advance a sim from `fromH` to `toH` hours of village time; returns the events, in order. A script acts at given steps. */
function run(
  sim: VillageSim,
  fromH: number,
  toH: number,
  script?: (step: number, events: VillageEvent[]) => void,
): string[] {
  const log: string[] = [];
  const events: VillageEvent[] = [];
  const from = Math.round((fromH * 3600) / DT);
  const to = Math.round((toH * 3600) / DT);
  for (let k = from; k < to; k++) {
    script?.(k, events);
    sim.beginStep();
    sim.update(
      DT,
      {
        playerDistM: 10,
        presenceActive: true,
        dayPhase: (0.3 + (k * DT) / DAY_S) % 1,
        vigil: false,
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
}
const TARGETS: Target[] = [
  { name: 'island-mountain', mapId: 'island-mountain' },
  // Has trees and shore spots, so woodcutters and fishermen hold work spots.
  { name: 'dala (trees and shore)', mapId: 'dala', seed: { x: 300, z: -60, rotY: 0 } },
];

const make = (map: LoadedMap, restore?: ReturnType<VillageSim['serialize']>) =>
  createVillageSim({
    sampler: map.sampler,
    metaOf: map.metaOf,
    seed: map.seed,
    trees: map.trees,
    restore,
  });

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
        const straightLog = run(straight, 0, before + after);

        const first = make(map);
        const firstLog = run(first, 0, before);
        const saved = first.serialize();
        const stored = structuredClone(saved); // what a store hands back

        // serialize copies: running on must not change what was saved
        const firstLogAfter = run(first, before, before + after);
        sameState(saved, stored, 'the saved state changed when the sim ran on');
        sameState(
          first.serialize(),
          straight.serialize(),
          'serializing disturbed the original run',
        );

        const resumed = make(map, stored);
        sameState(resumed.serialize(), stored, 'restoring and serializing again');
        const resumedLog = run(resumed, before, before + after);

        assert.deepEqual(firstLog.concat(resumedLog).length, straightLog.length);
        assert.deepEqual(resumedLog, firstLogAfter, 'events after the restore');
        sameState(resumed.serialize(), straight.serialize(), 'state after the continued run');
        assert.ok(straight.buildings.length > (before > 0.5 ? 20 : 2), 'the run built a village');
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
  }
};
const makeHamlet = (map: LoadedMap, restore?: ReturnType<VillageSim['serialize']>) =>
  createVillageSim({
    sampler: map.sampler,
    metaOf: map.metaOf,
    seed: map.seed,
    trees: map.trees,
    mode: 'hamlet',
    restore,
  });

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
  const parts = captureGame({
    game: { energy: 10, energyCap: 100, orbsAbsorbed: 1, phase: 0, memoryFragments: [] },
    dayCycle: { serialize: () => ({ reveal: 'idle', introElapsed: 0, elapsed: 0 }) },
    player: { position: { x: 0, z: 0 } },
    camera: { getYaw: () => 0, getPitch: () => 0.3 },
    orbs: {
      serialize: () => ({ absorbed: [], relocated: [], respawn: { remainingSec: 240, rng: null } }),
    },
    skills: { state: () => ({ opened: false, sparks: 0, ranks: {} }) },
    clocks: () => ({ elapsed: 100, windClock: 100 }),
    village: { sim },
    dayDurationSec: () => 1800,
    playSeconds: () => 100,
  });
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

console.log(failures === 0 ? '\nall village save checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
