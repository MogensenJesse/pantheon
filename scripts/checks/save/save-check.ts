// scripts/checks/save/save-check.ts — headless checks of the save system's rules (snapshot validation, migration, slot rotation, save service over a memory store, profile round trip, pause rules). The IndexedDB store is checked in the browser.
//
//   node --experimental-strip-types scripts/checks/save/save-check.ts
import assert from 'node:assert/strict';
import { parseDayCycle } from '../../../src/core/reveal/dayCycleState.ts';
import { loadBootRestore } from '../../../src/save/bootSave.ts';
import { captureGame, createAutosaver } from '../../../src/save/gameSave.ts';
import { migrateSnapshot } from '../../../src/save/migrate.ts';
import { applyGameProfile, captureProfile, parseProfile } from '../../../src/save/profile.ts';
import { createSaveService, type SaveParts } from '../../../src/save/saveService.ts';
import {
  isSlotMeta,
  newestFirst,
  nextAutosaveSlot,
  type SlotMeta,
} from '../../../src/save/slots.ts';
import { parseSnapshot, SAVE_VERSION } from '../../../src/save/snapshot.ts';
import { SaveError, type SaveStore } from '../../../src/save/store.ts';
import { check, finish } from '../lib/check.ts';
import { createMemoryStore } from '../lib/memoryStore.ts';
import { fakeGame, fakeSources } from '../lib/saveFixtures.ts';

const MAP = 'island-mountain';
const parts = (day = 3): SaveParts => ({
  playSeconds: 1234.5,
  summary: { day, population: 12 },
  profile: { energy: 100, player: { x: 1, z: 2, yaw: 0.5 } },
  village: {
    faith: 40,
    buildings: [{ id: 1, type: 'temple' }],
    wear: new Float32Array([0, 0.5, 1]),
  },
});

/** A clock that advances one second per call, so slots get distinct times. */
function clock(start = 1_000_000) {
  let t = start;
  return () => (t += 1000);
}

function service(store: SaveStore = createMemoryStore()) {
  return createSaveService(store, { mapId: MAP, now: clock() });
}

const snapshotOf = (over: Record<string, unknown> = {}) => ({
  version: SAVE_VERSION,
  savedAt: 5,
  playSeconds: 10,
  mapId: MAP,
  summary: { day: 1, population: 8 },
  profile: {},
  village: {},
  ...over,
});

// --- snapshot validation --------------------------------------------------------------------------

await check('parse: accepts a complete snapshot of the current version', () => {
  const r = parseSnapshot(snapshotOf(), { mapId: MAP });
  assert.ok(r.ok);
  assert.equal(r.migratedFrom, null);
});

await check('parse: refuses anything that is not a record, as corrupt', () => {
  for (const raw of [null, undefined, 42, 'save', [1, 2], true]) {
    const r = parseSnapshot(raw, { mapId: MAP });
    assert.ok(!r.ok && r.reason === 'corrupt', String(raw));
  }
});

await check('parse: refuses a bad version or missing or garbled fields as corrupt', () => {
  const bad: Record<string, unknown>[] = [
    { version: undefined },
    { version: 1.5 },
    { version: '1' },
    { savedAt: Number.NaN },
    { playSeconds: -1 },
    { mapId: '' },
    { summary: null },
    { summary: { day: 'x', population: 8 } },
    { profile: null },
    { village: [] },
  ];
  for (const over of bad) {
    const r = parseSnapshot(snapshotOf(over), { mapId: MAP });
    assert.ok(!r.ok && r.reason === 'corrupt', JSON.stringify(over));
  }
});

await check('parse: a newer version is refused as such, whatever else it contains', () => {
  const r = parseSnapshot({ version: SAVE_VERSION + 1, future: true }, { mapId: MAP });
  assert.ok(!r.ok && r.reason === 'newer-version');
});

await check('parse: another map is refused, and names the map', () => {
  const r = parseSnapshot(snapshotOf({ mapId: 'dala' }), { mapId: MAP });
  assert.ok(!r.ok && r.reason === 'other-map');
  assert.match(r.message, /dala/);
});

await check('parse: a save older than SAVE_VERSION is refused as too old', () => {
  for (const version of [1, SAVE_VERSION - 1]) {
    const r = parseSnapshot(snapshotOf({ version }), { mapId: MAP });
    assert.ok(!r.ok && r.reason === 'too-old', `version ${version}`);
    assert.match(r.message, /older version/);
  }
});

await check('migrate: an injected chain runs each step in order and stamps the new version', () => {
  const seen: number[] = [];
  const step = (at: number, apply: (n: number) => number) => (s: Record<string, unknown>) => {
    seen.push(at);
    return { ...s, n: apply(s.n as number) };
  };
  const out = migrateSnapshot({ version: 1, n: 0 }, 1, 4, {
    1: step(1, (n) => n + 1),
    2: step(2, (n) => n * 10),
    3: step(3, (n) => n + 5),
  });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(out.n, 15);
  assert.equal(out.version, 4);
});

// --- slot rotation --------------------------------------------------------------------------------

const meta = (id: SlotMeta['id'], savedAt: number): SlotMeta => ({
  id,
  savedAt,
  version: 1,
  mapId: MAP,
  playSeconds: 0,
  summary: { day: 1, population: 1 },
});

await check(
  'slots: the first autosave goes to auto-a, then auto-b, then the older of the two',
  () => {
    assert.equal(nextAutosaveSlot([]), 'auto-a');
    assert.equal(nextAutosaveSlot([meta('auto-a', 10)]), 'auto-b');
    assert.equal(nextAutosaveSlot([meta('auto-b', 10)]), 'auto-a');
    assert.equal(nextAutosaveSlot([meta('auto-a', 10), meta('auto-b', 20)]), 'auto-a');
    assert.equal(nextAutosaveSlot([meta('auto-a', 30), meta('auto-b', 20)]), 'auto-b');
  },
);

await check('slots: manual slots never take part in the autosave rotation', () => {
  assert.equal(nextAutosaveSlot([meta('manual-1', 1), meta('manual-2', 2)]), 'auto-a');
});

await check('slots: newestFirst orders by time and leaves its input alone', () => {
  const input = [meta('manual-1', 5), meta('auto-a', 9), meta('auto-b', 7)];
  assert.deepEqual(
    newestFirst(input).map((m) => m.id),
    ['auto-a', 'auto-b', 'manual-1'],
  );
  assert.equal(input[0]!.id, 'manual-1');
});

await check('slots: a damaged meta row is not a slot meta', () => {
  const good = meta('manual-1', 5);
  assert.equal(isSlotMeta(good), true);
  for (const bad of [null, 5, { ...good, id: 'slot-9' }, { ...good, summary: { day: 1 } }]) {
    assert.equal(isSlotMeta(bad), false, JSON.stringify(bad));
  }
});

// --- save service ---------------------------------------------------------------------------------

await check('service: a saved game loads back equal, including typed arrays', async () => {
  const s = service();
  await s.save('manual-1', parts());
  const r = await s.load('manual-1');
  assert.ok(r.ok);
  assert.equal(r.snapshot.mapId, MAP);
  assert.equal(r.snapshot.version, SAVE_VERSION);
  assert.equal(r.snapshot.playSeconds, 1234.5);
  assert.deepEqual(r.snapshot.profile, parts().profile);
  assert.deepEqual(r.snapshot.village, parts().village);
  assert.ok(r.snapshot.village.wear instanceof Float32Array);
  assert.deepEqual((await service().load('manual-2')).ok, false, 'an empty slot does not load');
});

await check('service: autosaves keep the last two and replace the older', async () => {
  const s = service();
  await s.autosave(parts(1));
  await s.autosave(parts(2));
  await s.autosave(parts(3));
  const list = newestFirst(await s.list());
  assert.deepEqual(
    list.map((m) => m.summary.day),
    [3, 2],
  );
});

await check('service: Continue loads the newest slot, manual or automatic', async () => {
  const s = service();
  await s.autosave(parts(1));
  await s.save('manual-3', parts(7));
  const r = await s.loadLatest();
  assert.ok(r.ok);
  assert.equal(r.slot, 'manual-3');
  assert.deepEqual(r.skipped, []);
  const none = await service().loadLatest();
  assert.ok(!none.ok && none.reason === 'empty');
});

await check(
  'service: a corrupt newest save is passed over and reported, the older one loads',
  async () => {
    const store = createMemoryStore();
    const s = service(store);
    await s.autosave(parts(1));
    await s.autosave(parts(2));
    const newest = newestFirst(await s.list())[0]!;
    store.data.set(newest.id, { version: SAVE_VERSION, garbage: true });
    const r = await s.loadLatest();
    assert.ok(r.ok);
    assert.equal(r.snapshot.summary.day, 1);
    assert.deepEqual(
      r.skipped.map((k) => [k.slot, k.reason]),
      [[newest.id, 'corrupt']],
    );
  },
);

await check(
  'service: a save from another map is refused and the slot is left in place',
  async () => {
    const store = createMemoryStore();
    await service(store).save('manual-1', parts());
    const other = createSaveService(store, { mapId: 'dala', now: clock() });
    const r = await other.load('manual-1');
    assert.ok(!r.ok && r.reason === 'other-map');
    assert.equal((await store.list()).length, 1);
  },
);

await check('service: refuses to write a save that it would not load back', async () => {
  const bad = { ...parts(), playSeconds: Number.NaN };
  await assert.rejects(() => service().save('manual-1', bad), /invalid save/);
});

// --- profile --------------------------------------------------------------------------------------

await check('profile: capture then parse gives every slice back', () => {
  const profile = captureProfile(fakeSources());
  const parsed = parseProfile(structuredClone(profile));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.profile, profile);
});

await check('profile: capture copies, so later changes do not reach the save', () => {
  const sources = fakeSources();
  const profile = captureProfile(sources);
  sources.game.memoryFragments.push(99);
  sources.game.energy = 1;
  assert.deepEqual(profile.game.memoryFragments, [1, 2]);
  assert.equal(profile.game.energy, 40);
});

await check('profile: parse refuses a damaged part and names it', () => {
  const good = captureProfile(fakeSources());
  const cases: [string, (p: any) => void][] = [
    ['game state', (p) => (p.game.energy = 101)],
    ['day cycle', (p) => (p.dayCycle.reveal = 'noon')],
    ['player position', (p) => (p.player.x = Number.POSITIVE_INFINITY)],
    ['orbs', (p) => (p.orbs = null)],
  ];
  for (const [part, damage] of cases) {
    const copy = structuredClone(good);
    damage(copy);
    const r = parseProfile(copy);
    assert.ok(!r.ok, `${part}: should be refused`);
    assert.match(r.message, new RegExp(part), r.message);
  }
  for (const raw of [null, undefined, 3, 'x', []]) assert.ok(!parseProfile(raw).ok);
});

await check('profile: applying a saved game state edits the live object in place', () => {
  const live = { energy: 0, energyCap: 100, orbsAbsorbed: 0, phase: 0, memoryFragments: [7] };
  const fragments = live.memoryFragments;
  const saved = { energy: 55, energyCap: 120, orbsAbsorbed: 9, phase: 1, memoryFragments: [1, 2] };
  applyGameProfile(live, saved);
  assert.deepEqual(live, saved);
  assert.equal(live.memoryFragments, fragments);
});

await check('parseDayCycle: a clean copy of a good state, null for a damaged one', () => {
  const good = { reveal: 'looping', introElapsed: 5, elapsed: 100.5 };
  assert.deepEqual(parseDayCycle(good), good);
  for (const bad of [null, { ...good, reveal: 'noon' }, { ...good, elapsed: -1 }]) {
    assert.equal(parseDayCycle(bad), null, JSON.stringify(bad));
  }
});

// --- capturing the game, autosaver, boot ----------------------------------------------------------

await check(
  'capture game: summary has the day and population, village slice empty without a village',
  () => {
    const captured = captureGame(fakeGame());
    assert.equal(captured.playSeconds, 99.5);
    assert.deepEqual(captured.summary, { day: 3, population: 0 });
    assert.deepEqual(captured.village, {});
    const withVillage = captureGame(
      fakeGame({
        village: { sim: { villagers: { count: 12 }, serialize: () => ({ marker: 1 }) as any } },
      }),
    );
    assert.equal(withVillage.summary.population, 12);
    assert.deepEqual(withVillage.village, { sim: { marker: 1 } });
  },
);

await check(
  'autosaver: manual saves go to their slot, automatic ones rotate and share a write in flight',
  async () => {
    const svc = service();
    const kinds: string[] = [];
    const saver = createAutosaver({
      service: svc,
      capture: () => captureGame(fakeGame()),
      automatic: false,
      onSaved: (m, kind) => kinds.push(`${kind}:${m.id}`),
    });
    await saver.saveNow('manual-2');
    const a = saver.saveNow();
    const b = saver.saveNow();
    assert.equal(a, b, 'a second automatic save while one is writing joins it');
    await a;
    await saver.saveNow();
    assert.deepEqual(kinds, ['manual:manual-2', 'auto:auto-a', 'auto:auto-b']);
    saver.dispose();
  },
);

await check(
  'autosaver: a failed write is reported and rejects, and the previous save stays',
  async () => {
    const store = createMemoryStore();
    const good = service(store);
    await createAutosaver({
      service: good,
      capture: () => captureGame(fakeGame()),
      automatic: false,
    }).saveNow('manual-1');
    const failing: SaveStore = {
      ...store,
      write: async () => {
        throw new SaveError('quota', 'Not enough storage space to save the game.');
      },
    };
    const errors: unknown[] = [];
    const saver = createAutosaver({
      service: service(failing),
      capture: () => captureGame(fakeGame()),
      automatic: false,
      onError: (e) => errors.push(e),
    });
    await assert.rejects(
      () => saver.saveNow('manual-1'),
      (e: SaveError) => e.code === 'quota',
    );
    assert.equal(errors.length, 1);
    assert.ok((await good.load('manual-1')).ok);
  },
);

await check(
  'save: a snapshot the game could not load back is refused and the slot is left as it was',
  async () => {
    const store = createMemoryStore();
    const picky = createSaveService(store, {
      mapId: MAP,
      now: clock(),
      validate: (s) => ((s.profile as any).game.energy > 50 ? 'too much energy' : null),
    });
    const good = createAutosaver({
      service: picky,
      capture: () => captureGame(fakeGame()),
      automatic: false,
    });
    await good.saveNow('manual-1');
    const before = await store.read('manual-1');
    const bad = createAutosaver({
      service: picky,
      capture: () => captureGame(fakeGame({ game: { ...fakeSources().game, energy: 90 } })),
      automatic: false,
    });
    await assert.rejects(bad.saveNow('manual-1'), /too much energy/);
    assert.deepEqual(await store.read('manual-1'), before, 'the good save is untouched');
  },
);

await check(
  'boot: no request means a new game; a request loads the newest valid save',
  async () => {
    const svc = service();
    const saver = createAutosaver({
      service: svc,
      capture: () => captureGame(fakeGame()),
      automatic: false,
    });
    const reports: string[] = [];
    const report = (m: string) => reports.push(m);
    assert.equal(await loadBootRestore(svc, { autosave: false, load: null }, report), null);
    assert.equal(await loadBootRestore(svc, { autosave: true, load: 'latest' }, report), null);
    assert.match(reports.pop()!, /no saved game/i);

    await saver.saveNow('manual-1');
    const boot = await loadBootRestore(svc, { autosave: true, load: 'latest' }, report);
    assert.ok(boot);
    assert.equal(boot.slot, 'manual-1');
    assert.equal(boot.village, null);
    assert.equal(boot.playSeconds, 99.5);
    assert.deepEqual(boot.profile.player, { x: 10.5, z: -20.25 });
    assert.deepEqual(reports, []);
  },
);

await check(
  'boot: a save the game cannot use is passed over with a message, not applied',
  async () => {
    const store = createMemoryStore();
    const reports: string[] = [];
    const picky = createSaveService(store, {
      mapId: MAP,
      now: clock(),
      validate: (s) => ((s.profile as any).game.energy > 50 ? 'too much energy' : null),
    });
    const saver = createAutosaver({
      service: picky,
      capture: () => captureGame(fakeGame()),
      automatic: false,
    });
    await saver.saveNow('manual-1'); // energy 40: fine
    // The picky service would refuse to write it, so an older build (no such rule) writes it.
    const rich = createAutosaver({
      service: createSaveService(store, { mapId: MAP, now: clock(2_000_000) }),
      capture: () => captureGame(fakeGame({ game: { ...fakeSources().game, energy: 90 } })),
      automatic: false,
    });
    await rich.saveNow('manual-2'); // newer, but unusable
    const boot = await loadBootRestore(picky, { autosave: true, load: 'latest' }, (m) =>
      reports.push(m),
    );
    assert.equal(boot?.slot, 'manual-1');
    assert.equal(reports.length, 1);
    assert.match(reports[0]!, /manual-2.*too much energy/);
    const direct = await loadBootRestore(picky, { autosave: true, load: 'manual-2' }, (m) =>
      reports.push(m),
    );
    assert.equal(direct, null);
    assert.match(reports.at(-1)!, /too much energy.*new game/i);
  },
);

finish('all save checks passed');
