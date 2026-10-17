// scripts/energy/energy-check.ts — headless checks of energy regeneration (shrine zones, Renewal) and
// orb respawn (where, when, how fast), and of the save migration that added the respawn state. The
// wiring (the HUD mark, the zone ring, orbs coming back in the world, saving them) is checked in the
// browser.
//
//   node --experimental-strip-types scripts/energy/energy-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../src/config/phase0.ts';
import {
  newRespawnClock,
  pickRespawnSpot,
  pickSlot,
  RETRY_SEC,
  respawnEnergy,
  retrySoon,
  stepRespawn,
} from '../../src/entities/energyOrb/respawn.ts';
import {
  regenRate,
  regenStep,
  type ShrineZone,
  toZone,
  zoneRateAt,
} from '../../src/entities/shrine/regen.ts';
import { migrateSnapshot } from '../../src/save/migrate.ts';
import { parseProfile } from '../../src/save/profile.ts';
import { SAVE_VERSION } from '../../src/save/snapshot.ts';
import { modifiersOf, SKILL_NODES, type SkillsState, unlock } from '../../src/skills/skillTree.ts';

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

/** A small deterministic random stream (the game uses alea; these checks only need repeatability). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// --- regeneration ---

const ZONE: ShrineZone = { x: 100, z: 100, radiusM: 12, regenPerSec: 0.5 };

await check('a shrine takes its radius and rate from the config unless the map gives them', () => {
  const z = toZone({ x: 1, z: 2 });
  assert.equal(z.radiusM, PHASE0.SHRINE.RADIUS_M);
  assert.equal(z.regenPerSec, PHASE0.SHRINE.REGEN_PER_SEC);
  assert.deepEqual(toZone({ x: 1, z: 2, radiusM: 5, regenPerSec: 2 }), {
    x: 1,
    z: 2,
    radiusM: 5,
    regenPerSec: 2,
  });
});

await check('the zone rate applies inside the radius (edge included) and not outside', () => {
  assert.equal(zoneRateAt([ZONE], 100, 100), 0.5);
  assert.equal(zoneRateAt([ZONE], 112, 100), 0.5);
  assert.equal(zoneRateAt([ZONE], 112.1, 100), 0);
  assert.equal(zoneRateAt([], 100, 100), 0);
});

await check('overlapping zones do not stack: the best one counts', () => {
  const near = { ...ZONE, regenPerSec: 0.5 };
  const strong = { ...ZONE, x: 105, regenPerSec: 1.2 };
  assert.equal(zoneRateAt([near, strong], 102, 100), 1.2);
});

await check('without Attunement the zone gives nothing; Renewal alone gives the trickle', () => {
  assert.equal(regenRate({ zoneRate: 0.5, attuned: 0, flatPerSec: 0 }), 0);
  assert.equal(regenRate({ zoneRate: 0.5, attuned: 1, flatPerSec: 0 }), 0.5);
  assert.equal(regenRate({ zoneRate: 0, attuned: 0, flatPerSec: 0.05 }), 0.05);
  assert.equal(regenRate({ zoneRate: 0.5, attuned: 1, flatPerSec: 0.05 }), 0.55);
  assert.equal(
    regenRate({ zoneRate: 0, attuned: 1, flatPerSec: 0 }),
    0,
    'Attunement outside a zone',
  );
});

await check('energy never goes above the cap and does not move at rate 0', () => {
  assert.equal(regenStep(99.9, 100, 0.5, 1), 100);
  assert.equal(regenStep(50, 100, 0.5, 2), 51);
  assert.equal(regenStep(50, 100, 0, 5), 50);
  assert.equal(regenStep(50, 100, 0.5, 0), 50);
  assert.equal(regenStep(150, 160, 1, 100), 160);
});

await check('empty to full in a shrine takes about three minutes at the first rate', () => {
  let e = 0;
  let seconds = 0;
  while (e < 100 && seconds < 1000) {
    e = regenStep(e, 100, 0.5, 1 / 60);
    seconds += 1 / 60;
  }
  assert.ok(seconds > 195 && seconds < 205, `${seconds.toFixed(1)} s`);
});

await check(
  'the skill nodes feed the rate: Attunement flips the switch, Renewal adds the trickle',
  () => {
    assert.equal(modifiersOf({ opened: true, sparks: 0, ranks: {} }).shrineAttuned, 0);
    const s: SkillsState = { opened: true, sparks: 2, ranks: {} };
    const a = unlock(s, 'attunement');
    assert.ok(a.ok);
    const aState = (a as { ok: true; state: SkillsState }).state;
    assert.equal(modifiersOf(aState).shrineAttuned, 1);
    assert.equal(modifiersOf(aState).flatRegenPerSec, 0);
    const r = unlock(aState, 'renewal');
    assert.ok(r.ok);
    const m = modifiersOf((r as { ok: true; state: SkillsState }).state);
    assert.equal(m.flatRegenPerSec, 0.05);
    assert.deepEqual(unlock(s, 'renewal'), { ok: false, reason: 'locked' });
  },
);

await check('Attunement is a cheap first pick: one spark and no prerequisite', () => {
  const node = SKILL_NODES.find((n) => n.id === 'attunement');
  assert.equal(node?.cost, 1);
  assert.deepEqual(node?.requires, []);
  assert.deepEqual(SKILL_NODES.find((n) => n.id === 'renewal')?.requires, ['attunement']);
});

// --- respawn: where ---

const BOUNDS = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
const land = () => true;

await check('a respawn spot is never near the player or a live orb and is always walkable', () => {
  const rng = lcg(7);
  const player = { x: 0, z: 0 };
  const live = [
    { x: 60, z: 60 },
    { x: -200, z: 100 },
  ];
  const walkable = (x: number, z: number) => x > -450 && Math.hypot(x - 300, z - 300) > 50;
  for (let i = 0; i < 300; i++) {
    const spot = pickRespawnSpot({
      rng,
      player,
      liveOrbs: live,
      shrines: [],
      bounds: BOUNDS,
      isWalkable: walkable,
    });
    assert.ok(spot, 'a spot');
    assert.ok(Math.hypot(spot.x - player.x, spot.z - player.z) >= PHASE0.RESPAWN.MIN_PLAYER_DIST_M);
    for (const o of live)
      assert.ok(Math.hypot(spot.x - o.x, spot.z - o.z) >= PHASE0.RESPAWN.MIN_ORB_DIST_M);
    assert.ok(walkable(spot.x, spot.z));
    assert.ok(
      spot.x >= BOUNDS.minX &&
        spot.x <= BOUNDS.maxX &&
        spot.z >= BOUNDS.minZ &&
        spot.z <= BOUNDS.maxZ,
    );
  }
});

await check('the same stream gives the same spots (a save can put the stream back)', () => {
  const run = () => {
    const rng = lcg(99);
    return Array.from({ length: 5 }, () =>
      pickRespawnSpot({
        rng,
        player: { x: 0, z: 0 },
        liveOrbs: [],
        shrines: [{ x: 50, z: 50 }],
        bounds: BOUNDS,
        isWalkable: land,
      }),
    );
  };
  assert.deepEqual(run(), run());
});

await check('with a shrine and full bias every spot lies in the ring around it', () => {
  const config = { ...PHASE0.RESPAWN, SHRINE_BIAS: 1 };
  const rng = lcg(3);
  const shrine = { x: 200, z: -100 };
  for (let i = 0; i < 200; i++) {
    const spot = pickRespawnSpot({
      rng,
      player: { x: 0, z: 0 },
      liveOrbs: [],
      shrines: [shrine],
      bounds: BOUNDS,
      isWalkable: land,
      config,
    });
    assert.ok(spot);
    const d = Math.hypot(spot.x - shrine.x, spot.z - shrine.z);
    assert.ok(d >= config.SHRINE_MIN_M - 1e-6 && d <= config.SHRINE_MAX_M + 1e-6, `${d}`);
  }
});

await check('denser near shrines: about half the spots land near one at the default bias', () => {
  const rng = lcg(11);
  const shrine = { x: 0, z: 300 };
  let near = 0;
  const n = 600;
  for (let i = 0; i < n; i++) {
    const spot = pickRespawnSpot({
      rng,
      player: { x: -400, z: -400 },
      liveOrbs: [],
      shrines: [shrine],
      bounds: BOUNDS,
      isWalkable: land,
    }) as { x: number; z: number };
    if (Math.hypot(spot.x - shrine.x, spot.z - shrine.z) <= PHASE0.RESPAWN.SHRINE_MAX_M) near++;
  }
  assert.ok(near / n > 0.4 && near / n < 0.65, `${near / n}`);
});

await check('keep-clear discs (the village) are respected; nothing fitting gives null', () => {
  const rng = lcg(5);
  const avoid = [{ x: 0, z: 0, radiusM: 400 }];
  for (let i = 0; i < 100; i++) {
    const spot = pickRespawnSpot({
      rng,
      player: { x: 480, z: 480 },
      liveOrbs: [],
      shrines: [],
      bounds: BOUNDS,
      isWalkable: land,
      avoid,
    });
    if (spot) assert.ok(Math.hypot(spot.x, spot.z) >= 400);
  }
  assert.equal(
    pickRespawnSpot({
      rng,
      player: { x: 0, z: 0 },
      liveOrbs: [],
      shrines: [],
      bounds: BOUNDS,
      isWalkable: () => false,
    }),
    null,
  );
});

await check('a respawned orb carries an energy value from the authored range', () => {
  const rng = lcg(1);
  for (let i = 0; i < 200; i++) {
    const e = respawnEnergy(rng);
    assert.ok(Number.isInteger(e) && e >= PHASE0.ORB.ENERGY_MIN && e < PHASE0.ORB.ENERGY_MAX);
  }
  const counts = new Set<number>();
  for (let i = 0; i < 20; i++) counts.add(pickSlot(rng, 3));
  assert.deepEqual([...counts].sort(), [0, 1, 2]);
  assert.equal(
    pickSlot(() => 0.999999, 3),
    2,
  );
});

// --- respawn: when ---

const open = { open: true, live: 5, free: 3 };

await check('the clock waits the whole interval, then says an orb is due and starts over', () => {
  const clock = newRespawnClock();
  assert.equal(stepRespawn(clock, PHASE0.RESPAWN.INTERVAL_SEC - 1, open), false);
  assert.equal(stepRespawn(clock, 0.5, open), false);
  assert.equal(stepRespawn(clock, 1, open), true);
  assert.equal(clock.remainingSec, PHASE0.RESPAWN.INTERVAL_SEC);
});

await check(
  'the clock does not run before the tree opens, with no free slot or at the live cap',
  () => {
    for (const ctx of [
      { open: false, live: 5, free: 3 },
      { open: true, live: 5, free: 0 },
      { open: true, live: PHASE0.RESPAWN.MAX_LIVE, free: 3 },
    ]) {
      const clock = newRespawnClock();
      clock.remainingSec = 10;
      assert.equal(stepRespawn(clock, 1000, ctx), false);
      assert.equal(clock.remainingSec, PHASE0.RESPAWN.INTERVAL_SEC, 'back to a full wait');
    }
  },
);

await check('dropping under the cap starts a full wait, not a part-used one', () => {
  const clock = newRespawnClock();
  stepRespawn(clock, 100, open);
  stepRespawn(clock, 1, { open: true, live: PHASE0.RESPAWN.MAX_LIVE, free: 1 });
  assert.equal(clock.remainingSec, PHASE0.RESPAWN.INTERVAL_SEC);
});

await check('a failed pick tries again soon, not after a whole interval', () => {
  const clock = newRespawnClock();
  retrySoon(clock);
  assert.equal(clock.remainingSec, RETRY_SEC);
  const short = { ...PHASE0.RESPAWN, INTERVAL_SEC: 5 };
  retrySoon(clock, short);
  assert.equal(clock.remainingSec, 5);
});

await check('the first numbers are the agreed ones', () => {
  assert.equal(PHASE0.RESPAWN.INTERVAL_SEC, 240);
  assert.equal(PHASE0.RESPAWN.MAX_LIVE, 12);
  assert.equal(PHASE0.RESPAWN.MIN_PLAYER_DIST_M, 40);
  assert.equal(PHASE0.RESPAWN.MIN_ORB_DIST_M, 25);
  assert.equal(PHASE0.SHRINE.RADIUS_M, 12);
  assert.equal(PHASE0.SHRINE.REGEN_PER_SEC, 0.5);
});

// --- the save ---

const v2Orbs = { absorbed: [{ x: 1, z: 2 }] };
const v2Profile = {
  game: { energy: 50, energyCap: 100, orbsAbsorbed: 3, phase: 1, memoryFragments: [] },
  dayCycle: { reveal: 'looping', introElapsed: 5, elapsed: 100 },
  player: { x: 1, z: 2 },
  camera: { yaw: 0, pitch: 0.4 },
  orbs: v2Orbs,
  clocks: { elapsed: 100, windClock: 100 },
  skills: { opened: true, sparks: 2, ranks: {} },
};

await check('the save version moved up for the respawn state', () => {
  assert.equal(SAVE_VERSION >= 3, true);
});

await check(
  'migrating 2 to 3 adds no relocated orbs and a full respawn clock, keeping the picked-up list',
  () => {
    const out = migrateSnapshot({ version: 2, profile: v2Profile }, 2, 3);
    const orbs = (out.profile as { orbs: unknown }).orbs;
    assert.deepEqual(orbs, {
      absorbed: [{ x: 1, z: 2 }],
      relocated: [],
      respawn: { remainingSec: PHASE0.RESPAWN.INTERVAL_SEC, rng: null },
    });
    assert.equal(out.version, 3);
  },
);

await check(
  'migrating 2 to 3 leaves a slice that already has the state, and tolerates a missing profile',
  () => {
    const have = {
      absorbed: [],
      relocated: [{ homeX: 1, homeZ: 1, x: 2, z: 2, energy: 3 }],
      respawn: { remainingSec: 7, rng: null },
    };
    const out = migrateSnapshot({ version: 2, profile: { ...v2Profile, orbs: have } }, 2, 3);
    assert.deepEqual((out.profile as { orbs: unknown }).orbs, have);
    assert.doesNotThrow(() => migrateSnapshot({ version: 2 }, 2, 3));
  },
);

await check('a version 1 save runs the whole chain: skills, then orb respawn state', () => {
  const v1 = { ...v2Profile, orbs: v2Orbs } as Record<string, unknown>;
  delete v1.skills;
  const out = migrateSnapshot({ version: 1, profile: v1 }, 1, SAVE_VERSION);
  const profile = out.profile as { skills: { opened: boolean }; orbs: { relocated: unknown[] } };
  assert.equal(profile.skills.opened, true);
  assert.deepEqual(profile.orbs.relocated, []);
  assert.equal(parseProfile(out.profile).ok, true, 'and the result parses as a current profile');
});

await check(
  'parseProfile keeps relocated orbs and the respawn state, and refuses damaged ones',
  () => {
    const good = {
      absorbed: [{ x: 1, z: 2 }],
      relocated: [{ homeX: 5, homeZ: 6, x: 7, z: 8, energy: 4 }],
      respawn: { remainingSec: 120.5, rng: [0.1, 0.2, 0.3, 4] },
    };
    const r = parseProfile({ ...v2Profile, orbs: good });
    assert.ok(r.ok);
    assert.deepEqual((r as { ok: true; profile: { orbs: unknown } }).profile.orbs, good);
    const bad: [string, unknown][] = [
      ['no relocated list', { ...good, relocated: undefined }],
      [
        'relocated entry missing energy',
        { ...good, relocated: [{ homeX: 5, homeZ: 6, x: 7, z: 8 }] },
      ],
      ['negative energy', { ...good, relocated: [{ homeX: 5, homeZ: 6, x: 7, z: 8, energy: -1 }] }],
      ['no respawn state', { ...good, respawn: undefined }],
      ['negative clock', { ...good, respawn: { remainingSec: -1, rng: null } }],
      ['rng of the wrong length', { ...good, respawn: { remainingSec: 1, rng: [1, 2, 3] } }],
      ['rng not numbers', { ...good, respawn: { remainingSec: 1, rng: ['a', 'b', 'c', 'd'] } }],
    ];
    for (const [what, orbs] of bad)
      assert.equal(parseProfile({ ...v2Profile, orbs }).ok, false, what);
  },
);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall energy checks passed');
