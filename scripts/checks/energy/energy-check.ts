// scripts/checks/energy/energy-check.ts — headless checks of energy regeneration, orb respawn (where, when) and the orbs save state.
//
//   node --experimental-strip-types scripts/checks/energy/energy-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import {
  parseOrbs,
  planRestore,
  RESTORE_MATCH_M,
  serializeOrbs,
} from '../../../src/entities/energyOrb/orbState.ts';
import {
  newRespawnClock,
  pickRespawnSpot,
  pickSlot,
  RETRY_SEC,
  respawnEnergy,
  retrySoon,
  stepRespawn,
} from '../../../src/entities/energyOrb/respawn.ts';
import {
  regenRate,
  regenStep,
  type ShrineZone,
  templeRateAt,
  zoneRateAt,
} from '../../../src/gameplay/energyRegen/regen.ts';
import { check, finish } from '../lib/check.ts';

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

await check('Devotion: the believers send energy, and the temple restores it around it', () => {
  const base = { zoneRate: 0, attuned: 0, flatPerSec: 0 };
  assert.equal(regenRate({ ...base, believerRate: 0.055 }), 0.055);
  assert.equal(regenRate({ ...base, templeRate: 0.5 }), 0.5, 'the temple needs no Attunement');
  // the temple and a shrine do not stack; the flat trickle and the believers do
  assert.equal(regenRate({ zoneRate: 0.5, attuned: 1, flatPerSec: 0, templeRate: 0.5 }), 0.5);
  assert.equal(
    regenRate({ zoneRate: 0.5, attuned: 1, flatPerSec: 0.05, templeRate: 0.4, believerRate: 0.1 }),
    0.65,
  );
  const temple = { x: 100, z: 100 };
  assert.equal(templeRateAt(temple, 105, 100, 12, 0.5), 0.5);
  assert.equal(templeRateAt(temple, 130, 100, 12, 0.5), 0);
  assert.equal(templeRateAt(null, 100, 100, 12, 0.5), 0);
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

// --- the orbs' saved state (orbState.ts) ---

const HOMES = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 20, z: 0 },
];

await check(
  'serializeOrbs: absorbed slots by their home, respawned ones by where they are now',
  () => {
    const state = serializeOrbs(
      [
        { home: HOMES[0]!, absorbed: true, respawned: false, x: 0, z: 0, energy: 5 },
        { home: HOMES[1]!, absorbed: false, respawned: true, x: 33, z: 4, energy: 7 },
        { home: HOMES[2]!, absorbed: false, respawned: false, x: 20, z: 0, energy: 5 },
      ],
      { remainingSec: 12, rng: null },
    );
    assert.deepEqual(state.absorbed, [{ x: 0, z: 0 }]);
    assert.deepEqual(state.relocated, [{ homeX: 10, homeZ: 0, x: 33, z: 4, energy: 7 }]);
    assert.deepEqual(state.respawn, { remainingSec: 12, rng: null });
  },
);

await check(
  'planRestore: matches saved places to live slots by home, within the match distance',
  () => {
    const live = () => true;
    const plan = planRestore(HOMES, live, {
      absorbed: [{ x: 0.3, z: -0.2 }],
      relocated: [{ homeX: 10, homeZ: 0, x: 50, z: 50, energy: 9 }],
    });
    assert.deepEqual(plan, [
      { slot: 0, kind: 'absorb' },
      { slot: 1, kind: 'relocate', x: 50, z: 50, energy: 9 },
    ]);
    const far = planRestore(HOMES, live, {
      absorbed: [{ x: RESTORE_MATCH_M + 0.1, z: 0 }],
      relocated: [],
    });
    assert.deepEqual(far, [], 'a place with no slot near it (a map edited since) is dropped');
  },
);

await check('planRestore: a slot is used once, and a slot that is not live is not matched', () => {
  const twice = planRestore(HOMES, () => true, {
    absorbed: [
      { x: 0, z: 0 },
      { x: 0.1, z: 0 },
    ],
    relocated: [{ homeX: 0, homeZ: 0, x: 5, z: 5, energy: 1 }],
  });
  assert.equal(twice.length, 1, 'one slot, one action');
  const none = planRestore(HOMES, (i) => i !== 0, { absorbed: [{ x: 0, z: 0 }], relocated: [] });
  assert.deepEqual(none, []);
});

await check('parseOrbs: a clean copy of a good state, null for every damaged part', () => {
  const good = {
    absorbed: [{ x: 1, z: 2 }],
    relocated: [{ homeX: 1, homeZ: 1, x: 2, z: 2, energy: 3 }],
    respawn: { remainingSec: 7, rng: [0.1, 0.2, 0.3, 4] },
  };
  const parsed = parseOrbs(good);
  assert.deepEqual(parsed, good);
  assert.notEqual(parsed!.respawn.rng, good.respawn.rng, 'a copy, not the stored array');
  for (const bad of [
    null,
    { ...good, absorbed: [{ x: 'a', z: 1 }] },
    { ...good, relocated: [{ homeX: 1 }] },
    { ...good, respawn: { remainingSec: -1, rng: null } },
    { ...good, respawn: { remainingSec: 1, rng: [1, 2, 3] } },
  ]) {
    assert.equal(parseOrbs(bad), null, JSON.stringify(bad));
  }
});

finish('all energy checks passed');
