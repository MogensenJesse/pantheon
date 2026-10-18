// scripts/save/save-check.ts — headless checks of the save system's rules (snapshot validation,
// migration chain, slot rotation, save service over a memory store). The IndexedDB store is checked in
// the browser.
//
//   node --experimental-strip-types scripts/save/save-check.ts
import assert from 'node:assert/strict';
import { loadBootRestore } from '../../src/save/bootSave.ts';
import { captureGame, createAutosaver, type GameSaveSources } from '../../src/save/gameSave.ts';
import { migrateSnapshot } from '../../src/save/migrate.ts';
import {
  applyGameProfile,
  captureProfile,
  dayOf,
  type ProfileSources,
  parseProfile,
} from '../../src/save/profile.ts';
import {
  loadUrl,
  readSaveRequest,
  resolveLaunch,
  startScreenUrl,
} from '../../src/save/saveRequest.ts';
import { createSaveService, type SaveParts } from '../../src/save/saveService.ts';
import { newestFirst, nextAutosaveSlot, type SlotMeta } from '../../src/save/slots.ts';
import {
  describeSlot,
  formatPlayTime,
  formatSavedAt,
  loadRows,
  saveRows,
} from '../../src/save/slotView.ts';
import { parseSnapshot, SAVE_VERSION } from '../../src/save/snapshot.ts';
import { createMemoryStore, SaveError, type SaveStore } from '../../src/save/store.ts';
import { pauseOnKey, pauseOnLockChange } from '../../src/ui/pauseRules.ts';

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

const service_ = (store: SaveStore) => createSaveService(store, { mapId: MAP, now: clock() });

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

await check(
  'migrate 3 to 4: an old village counts as converted, everyone believes, the first priest is the elder',
  () => {
    const role = new Uint8Array([2, 3, 1, 1, 0]);
    const old = { version: 3, village: { sim: { seedId: 1, villagers: { count: 5, role } } } };
    const out = migrateSnapshot(old, 3, 4) as { village: { sim: Record<string, any> } };
    const sim = out.village.sim;
    assert.equal(sim.converted, true);
    assert.equal(sim.elder, 2);
    assert.ok(sim.villagers.belief instanceof Float32Array);
    assert.deepEqual([...sim.villagers.belief], [1, 1, 1, 1, 1]);
    assert.equal(sim.villagers.role, role, 'the rest of the pool is kept');
    assert.equal(sim.seedId, 1);
  },
);

await check(
  'migrate 3 to 4: a village with no priest has no elder; a slice that already has the fields, no village or a damaged one is left alone',
  () => {
    const none = migrateSnapshot(
      { version: 3, village: { sim: { villagers: { count: 2, role: new Uint8Array([0, 2]) } } } },
      3,
      4,
    ) as any;
    assert.equal(none.village.sim.elder, -1);
    const have = {
      version: 3,
      village: {
        sim: { converted: false, elder: 0, villagers: { count: 1, role: new Uint8Array([1]) } },
      },
    };
    assert.deepEqual((migrateSnapshot(have, 3, 4) as any).village.sim.converted, false);
    assert.doesNotThrow(() => migrateSnapshot({ version: 3 }, 3, 4));
    assert.doesNotThrow(() => migrateSnapshot({ version: 3, village: { sim: null } }, 3, 4));
    assert.doesNotThrow(() =>
      migrateSnapshot({ version: 3, village: { sim: { villagers: 5 } } }, 3, 4),
    );
  },
);

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

// --- profile --------------------------------------------------------------------------------------

const fakeSources = (over: Partial<ProfileSources> = {}): ProfileSources => ({
  game: { energy: 40, energyCap: 100, orbsAbsorbed: 3, phase: 0, memoryFragments: [1, 2] },
  dayCycle: { serialize: () => ({ reveal: 'looping', introElapsed: 12, elapsed: 345.5 }) },
  player: { position: { x: 10.5, z: -20.25 } },
  camera: { getYaw: () => 1.25, getPitch: () => 0.4 },
  orbs: {
    serialize: () => ({
      absorbed: [{ x: 1, z: 2 }],
      relocated: [{ homeX: 5, homeZ: 6, x: 7, z: 8, energy: 4 }],
      respawn: { remainingSec: 100, rng: [0.1, 0.2, 0.3, 4] },
    }),
  },
  skills: { state: () => ({ opened: true, sparks: 1, ranks: { resonance: 1 } }) },
  quest: { state: () => ({ step: 1, progress: 2, done: false, beats: ['elder-meets'] }) },
  clocks: () => ({ elapsed: 5000, windClock: 4900.5 }),
  ...over,
});

await check('profile: capture then parse gives the same state back', () => {
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

await check('profile: parse refuses each damaged part and names it', () => {
  const good = captureProfile(fakeSources());
  const cases: [string, (p: any) => void][] = [
    ['game state', (p) => (p.game.energy = Number.NaN)],
    ['game state', (p) => (p.game.energy = 101)],
    ['game state', (p) => (p.game.energyCap = 0)],
    ['game state', (p) => (p.game.orbsAbsorbed = 1.5)],
    ['game state', (p) => (p.game.memoryFragments = ['a'])],
    ['game state', (p) => (p.game = null)],
    ['day cycle', (p) => (p.dayCycle.reveal = 'noon')],
    ['day cycle', (p) => (p.dayCycle.elapsed = -1)],
    ['player position', (p) => (p.player.x = Number.POSITIVE_INFINITY)],
    ['camera', (p) => (p.camera.yaw = 'x')],
    ['orbs', (p) => (p.orbs.absorbed = [{ x: 1 }])],
    ['orbs', (p) => (p.orbs = null)],
    ['clocks', (p) => (p.clocks.windClock = -5)],
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
  applyGameProfile(live, {
    energy: 55,
    energyCap: 120,
    orbsAbsorbed: 9,
    phase: 1,
    memoryFragments: [1, 2],
  });
  assert.deepEqual(live, {
    energy: 55,
    energyCap: 120,
    orbsAbsorbed: 9,
    phase: 1,
    memoryFragments: [1, 2],
  });
  assert.equal(live.memoryFragments, fragments);
});

await check('profile: the game day counts turns of the sun from 1', () => {
  assert.equal(dayOf(0, 1800), 1);
  assert.equal(dayOf(1799, 1800), 1);
  assert.equal(dayOf(1800, 1800), 2);
  assert.equal(dayOf(5000, 0), 1);
});

await check('save request: opt-in per visit', () => {
  assert.deepEqual(readSaveRequest(''), { autosave: false, load: null });
  assert.deepEqual(readSaveRequest('?map=dala'), { autosave: false, load: null });
  assert.deepEqual(readSaveRequest('?save'), { autosave: true, load: null });
  assert.deepEqual(readSaveRequest('?load=latest'), { autosave: true, load: 'latest' });
  assert.deepEqual(readSaveRequest('?map=x&load=Manual-2'), { autosave: true, load: 'manual-2' });
  assert.deepEqual(readSaveRequest('?load=nonsense'), { autosave: false, load: null });
});

// --- capturing the game, autosaver, boot ----------------------------------------------------------

const fakeGame = (over: Partial<GameSaveSources> = {}): GameSaveSources => ({
  ...fakeSources(),
  village: null,
  dayDurationSec: () => 1800,
  playSeconds: () => 99.5,
  ...over,
});

await check(
  'capture game: summary has the day and population, village slice empty without a village',
  () => {
    const parts = captureGame(fakeGame());
    assert.equal(parts.playSeconds, 99.5);
    assert.deepEqual(parts.summary, { day: 3, population: 0, thumbnail: null });
    assert.deepEqual(parts.village, {});
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
    const store = createMemoryStore();
    const service = service_(store);
    const kinds: string[] = [];
    const saver = createAutosaver({
      service,
      capture: () => captureGame(fakeGame()),
      automatic: false,
      onSaved: (meta, kind) => kinds.push(`${kind}:${meta.id}`),
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
    const good = service_(store);
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
      service: service_(failing),
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
  'boot: no request means a new game; a request loads the newest valid save',
  async () => {
    const store = createMemoryStore();
    const service = service_(store);
    const saver = createAutosaver({
      service,
      capture: () => captureGame(fakeGame()),
      automatic: false,
    });
    const reports: string[] = [];
    const report = (m: string) => reports.push(m);
    assert.equal(await loadBootRestore(service, { autosave: false, load: null }, report), null);
    assert.equal(await loadBootRestore(service, { autosave: true, load: 'latest' }, report), null);
    assert.match(reports.pop()!, /no saved game/i);

    await saver.saveNow('manual-1');
    const boot = await loadBootRestore(service, { autosave: true, load: 'latest' }, report);
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
    const rich = createAutosaver({
      service: picky,
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

// --- M0b: launch choice, slot lists, pause rules -------------------------------------------------

await check(
  'launch: an explicit request skips the start screen; DEV plain visits stay quick',
  () => {
    assert.deepEqual(resolveLaunch('?load=manual-1', false), {
      kind: 'request',
      request: { autosave: true, load: 'manual-1' },
    });
    assert.deepEqual(resolveLaunch('?new', false), {
      kind: 'request',
      request: { autosave: true, load: null },
    });
    assert.deepEqual(resolveLaunch('?save', true), {
      kind: 'request',
      request: { autosave: true, load: null },
    });
    assert.deepEqual(resolveLaunch('', false), { kind: 'start' });
    assert.deepEqual(resolveLaunch('?map=dala', false), { kind: 'start' });
    assert.deepEqual(resolveLaunch('', true), {
      kind: 'request',
      request: { autosave: false, load: null },
    });
    assert.deepEqual(resolveLaunch('?start', true), { kind: 'start' });
    assert.deepEqual(resolveLaunch('?load=latest&start', true), {
      kind: 'request',
      request: { autosave: true, load: 'latest' },
    });
  },
);

await check('launch: menus rebuild the address keeping the map and nothing stale', () => {
  assert.equal(
    startScreenUrl('http://x/?map=dala&load=manual-1&save'),
    'http://x/?map=dala&start=',
  );
  assert.equal(
    loadUrl('http://x/?map=dala&start=&new', 'auto-a'),
    'http://x/?map=dala&load=auto-a',
  );
  assert.equal(loadUrl('http://x/', 'latest'), 'http://x/?load=latest');
});

const row = (
  id: SlotMeta['id'],
  savedAt: number,
  day = 2,
  population = 9,
  playSeconds = 600,
): SlotMeta => ({
  id,
  savedAt,
  version: 1,
  mapId: MAP,
  playSeconds,
  summary: { day, population, thumbnail: null },
});

await check(
  'slot rows: autosaves newest first and only when they exist, manual slots always',
  () => {
    assert.deepEqual(
      loadRows([]).map((r) => [r.id, r.label, r.meta]),
      [
        ['manual-1', 'Slot 1', null],
        ['manual-2', 'Slot 2', null],
        ['manual-3', 'Slot 3', null],
      ],
    );
    const rows = loadRows([row('auto-a', 100), row('auto-b', 200), row('manual-2', 50)]);
    assert.deepEqual(
      rows.map((r) => [r.id, r.label]),
      [
        ['auto-b', 'Autosave'],
        ['auto-a', 'Previous autosave'],
        ['manual-1', 'Slot 1'],
        ['manual-2', 'Slot 2'],
        ['manual-3', 'Slot 3'],
      ],
    );
    assert.equal(rows[3]!.meta?.id, 'manual-2');
  },
);

await check('slot rows: saving offers the three manual slots, never the autosaves', () => {
  assert.deepEqual(
    saveRows([row('auto-a', 1), row('manual-3', 2)]).map((r) => [r.id, r.meta !== null]),
    [
      ['manual-1', false],
      ['manual-2', false],
      ['manual-3', true],
    ],
  );
});

await check('slot text: play time, saved time and the two lines of a slot', () => {
  assert.equal(formatPlayTime(20), 'under a minute');
  assert.equal(formatPlayTime(12 * 60 + 5), '12 min');
  assert.equal(formatPlayTime(3600 + 5 * 60), '1 h 05 min');
  assert.equal(formatPlayTime(2 * 3600 + 59 * 60), '2 h 59 min');
  const now = new Date(2026, 9, 17, 15, 0).getTime();
  assert.equal(formatSavedAt(now - 20_000, now), 'just now');
  assert.equal(formatSavedAt(now - 5 * 60_000, now), '5 min ago');
  assert.equal(formatSavedAt(new Date(2026, 9, 17, 9, 5).getTime(), now), 'today 09:05');
  assert.equal(formatSavedAt(new Date(2026, 9, 16, 21, 30).getTime(), now), 'yesterday 21:30');
  assert.equal(formatSavedAt(new Date(2026, 8, 3, 12, 0).getTime(), now), '3 Sep 2026');
  assert.deepEqual(describeSlot(row('manual-1', now - 60_000, 4, 1, 3700), now), {
    title: 'Day 4 · 1 villager',
    detail: '1 h 01 min played · saved 1 min ago',
  });
  assert.equal(describeSlot(row('manual-1', now, 1, 17), now).title, 'Day 1 · 17 villagers');
});

await check(
  'pause rules: the menu opens when the lock is lost or Esc arrives, never over a panel',
  () => {
    const ctx = { ready: true, panelOpen: false };
    assert.equal(pauseOnLockChange(true, false, ctx), true);
    assert.equal(pauseOnLockChange(true, false, { ...ctx, panelOpen: true }), false);
    assert.equal(pauseOnLockChange(true, false, { ...ctx, ready: false }), false);
    assert.equal(pauseOnLockChange(false, false, ctx), false);
    assert.equal(pauseOnLockChange(false, true, ctx), false);
    assert.equal(pauseOnKey('Escape', false, ctx), true);
    assert.equal(pauseOnKey('Escape', true, ctx), false);
    assert.equal(pauseOnKey('Escape', false, { ...ctx, panelOpen: true }), false);
    assert.equal(pauseOnKey('Escape', false, { ...ctx, ready: false }), false);
    assert.equal(pauseOnKey('KeyE', false, ctx), false);
  },
);

await check('autosaver: reports when a write starts, before it finishes', async () => {
  const events: string[] = [];
  const saver = createAutosaver({
    service: service_(createMemoryStore()),
    capture: () => captureGame(fakeGame()),
    automatic: false,
    onStart: (k) => events.push(`start:${k}`),
    onSaved: (_m, k) => events.push(`saved:${k}`),
  });
  await saver.saveNow('manual-1');
  assert.deepEqual(events, ['start:manual', 'saved:manual']);
});

console.log(failures === 0 ? '\nall save checks passed' : `\n${failures} save check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
