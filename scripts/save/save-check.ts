// scripts/save/save-check.ts — headless checks of the save system's rules (snapshot validation,
// migration chain, slot rotation, save service over a memory store). The IndexedDB store is checked in
// the browser.
//
//   node --experimental-strip-types scripts/save/save-check.ts
import assert from 'node:assert/strict';
import { migrateSnapshot } from '../../src/save/migrate.ts';
import { createSaveService, type SaveParts } from '../../src/save/saveService.ts';
import { newestFirst, nextAutosaveSlot, type SlotMeta } from '../../src/save/slots.ts';
import { parseSnapshot, SAVE_VERSION } from '../../src/save/snapshot.ts';
import { createMemoryStore, SaveError, type SaveStore } from '../../src/save/store.ts';

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

const MAP = 'island-mountain';
const parts = (day = 3): SaveParts => ({
  playSeconds: 1234.5,
  summary: { day, population: 12, thumbnail: null },
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

function service(store: SaveStore = createMemoryStore(), extra = {}) {
  return createSaveService(store, { mapId: MAP, now: clock(), ...extra });
}

const snapshotOf = (over: Record<string, unknown> = {}) => ({
  version: SAVE_VERSION,
  savedAt: 5,
  playSeconds: 10,
  mapId: MAP,
  summary: { day: 1, population: 8, thumbnail: null },
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

await check('parse: refuses a bad or missing version as corrupt', () => {
  for (const version of [undefined, 0, -1, 1.5, '1', Number.NaN]) {
    const r = parseSnapshot(snapshotOf({ version }), { mapId: MAP });
    assert.ok(!r.ok && r.reason === 'corrupt', String(version));
  }
});

await check('parse: refuses missing or garbled fields as corrupt', () => {
  const bad: Record<string, unknown>[] = [
    { savedAt: undefined },
    { savedAt: Number.NaN },
    { playSeconds: -1 },
    { mapId: '' },
    { mapId: 7 },
    { summary: null },
    { summary: { day: 1, population: 8 } },
    { summary: { day: 'x', population: 8, thumbnail: null } },
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

// --- migration ------------------------------------------------------------------------------------

await check('migrate: runs each step in order and stamps the new version', () => {
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

await check('migrate: a missing step throws', () => {
  assert.throws(() => migrateSnapshot({ version: 1 }, 1, 3, { 1: (s) => s }), /version 2/);
});

await check(
  'parse: upgrades an older save through the chain and reports where it came from',
  () => {
    const old = { ...snapshotOf({ version: 1 }), summary: undefined, day: 9 };
    const r = parseSnapshot(old, {
      mapId: MAP,
      currentVersion: 2,
      migrations: { 1: (s) => ({ ...s, summary: { day: s.day, population: 0, thumbnail: null } }) },
    });
    assert.ok(r.ok);
    assert.equal(r.migratedFrom, 1);
    assert.equal(r.snapshot.version, 2);
    assert.equal(r.snapshot.summary.day, 9);
  },
);

await check('parse: an older save with no path forward, or a failing step, is corrupt', () => {
  const noPath = parseSnapshot(snapshotOf({ version: 1 }), {
    mapId: MAP,
    currentVersion: 2,
    migrations: {},
  });
  assert.ok(!noPath.ok && noPath.reason === 'corrupt');
  const throws = parseSnapshot(snapshotOf({ version: 1 }), {
    mapId: MAP,
    currentVersion: 2,
    migrations: {
      1: () => {
        throw new Error('boom');
      },
    },
  });
  assert.ok(!throws.ok && throws.reason === 'corrupt');
});

await check('parse: a migrated save is still checked for shape and map', () => {
  const bad = parseSnapshot(snapshotOf({ version: 1 }), {
    mapId: MAP,
    currentVersion: 2,
    migrations: { 1: (s) => ({ ...s, village: null }) },
  });
  assert.ok(!bad.ok && bad.reason === 'corrupt');
  const other = parseSnapshot(snapshotOf({ version: 1, mapId: 'dala' }), {
    mapId: MAP,
    currentVersion: 2,
    migrations: { 1: (s) => s },
  });
  assert.ok(!other.ok && other.reason === 'other-map');
});

// --- slot rotation --------------------------------------------------------------------------------

const meta = (id: SlotMeta['id'], savedAt: number): SlotMeta => ({
  id,
  savedAt,
  version: 1,
  mapId: MAP,
  playSeconds: 0,
  summary: { day: 1, population: 1, thumbnail: null },
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
});

await check('service: an empty slot says so', async () => {
  const r = await service().load('manual-2');
  assert.ok(!r.ok && r.reason === 'empty');
});

await check('service: the list carries one line per slot without the saves', async () => {
  const s = service();
  await s.save('manual-1', parts(4));
  await s.autosave(parts(5));
  const list = await s.list();
  assert.equal(list.length, 2);
  assert.ok(list.every((m) => !('village' in m) && !('profile' in m)));
  assert.equal(list.find((m) => m.id === 'manual-1')!.summary.day, 4);
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
  assert.equal(list.length, 2);
});

await check('service: Continue loads the newest slot, manual or automatic', async () => {
  const s = service();
  await s.autosave(parts(1));
  await s.save('manual-3', parts(7));
  const r = await s.loadLatest();
  assert.ok(r.ok);
  assert.equal(r.slot, 'manual-3');
  assert.deepEqual(r.skipped, []);
});

await check('service: Continue with nothing saved says there is no game', async () => {
  const r = await service().loadLatest();
  assert.ok(!r.ok && r.reason === 'empty');
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
  'service: when every slot is unusable, the newest slot’s reason is reported',
  async () => {
    const store = createMemoryStore();
    const s = service(store);
    await s.autosave(parts(1));
    store.data.set('auto-a', { version: SAVE_VERSION + 5 });
    const r = await s.loadLatest();
    assert.ok(!r.ok && r.reason === 'newer-version');
    assert.equal(r.skipped.length, 1);
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

await check('service: a failed write leaves the previous save of the slot readable', async () => {
  const store = createMemoryStore();
  const s = service(store);
  await s.save('manual-1', parts(1));
  const failing: SaveStore = {
    ...store,
    write: async () => {
      throw new SaveError('quota', 'Not enough storage space to save the game.');
    },
  };
  const broken = service(failing);
  await assert.rejects(
    () => broken.save('manual-1', parts(2)),
    (e: SaveError) => e.code === 'quota',
  );
  const r = await s.load('manual-1');
  assert.ok(r.ok);
  assert.equal(r.snapshot.summary.day, 1);
});

await check(
  'service: a store that cannot be read reports unavailable instead of throwing',
  async () => {
    const store: SaveStore = {
      list: async () => [],
      read: async () => {
        throw new SaveError('unavailable', 'Browser storage is unavailable.');
      },
      write: async () => {},
      remove: async () => {},
    };
    const r = await service(store).load('manual-1');
    assert.ok(!r.ok && r.reason === 'unavailable');
  },
);

await check('service: refuses to write a save that it would not load back', async () => {
  const bad = { ...parts(), playSeconds: Number.NaN };
  await assert.rejects(() => service().save('manual-1', bad), /invalid save/);
});

await check('service: remove empties the slot', async () => {
  const s = service();
  await s.save('manual-1', parts());
  await s.remove('manual-1');
  const r = await s.load('manual-1');
  assert.ok(!r.ok && r.reason === 'empty');
  assert.equal((await s.list()).length, 0);
});

console.log(failures === 0 ? '\nall save checks passed' : `\n${failures} save check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
