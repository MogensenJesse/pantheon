// scripts/checks/life/life-check.ts — headless checks of the life at the places of power: levels, easing, and a load
// that shows every place as it was.
// Run: node --experimental-strip-types scripts/checks/life/life-check.ts
import assert from 'node:assert/strict';
import { life } from '../../../src/config/visual/life.ts';
import { fireflyGate } from '../../../src/life/driftRules.ts';
import { createAmbientLife } from '../../../src/life/places/ambientLife.ts';
import {
  cloudRadiusM,
  easeLevel,
  isFireflyCloud,
  LIFE_KINDS,
  lifeOf,
  type PlaceFacts,
  placeTarget,
} from '../../../src/life/places/lifeRules.ts';
import type { PlaceLife } from '../../../src/life/places/placeLife.ts';
import type { LandmarkKind } from '../../../src/map/MapTypes.ts';
import { check, finish } from '../lib/check.ts';

const P = life.PLACES;

const dormant: PlaceFacts = { awake: false, restored: false, nameReturned: false };
const awake: PlaceFacts = { awake: true, restored: false, nameReturned: false };
const restored: PlaceFacts = { awake: true, restored: true, nameReturned: false };

await check(
  'a place has no life while it sleeps, a little once awake, and all of it once restored',
  () => {
    assert.equal(placeTarget(dormant), 0);
    assert.equal(placeTarget(awake), P.LEVELS.AWAKE);
    assert.equal(placeTarget(restored), P.LEVELS.RESTORED);
    assert.ok(P.LEVELS.AWAKE > 0 && P.LEVELS.AWAKE < P.LEVELS.RESTORED, 'awake is faint, not full');
  },
);

await check(
  'once the name has returned every place keeps a small mark, and never loses what it had',
  () => {
    const returned = (f: PlaceFacts): PlaceFacts => ({ ...f, nameReturned: true });
    assert.equal(placeTarget(returned(dormant)), P.LEVELS.TRACE);
    assert.equal(placeTarget(returned(awake)), Math.max(P.LEVELS.AWAKE, P.LEVELS.TRACE));
    assert.equal(placeTarget(returned(restored)), P.LEVELS.RESTORED);
    assert.ok(
      P.LEVELS.TRACE > 0 && P.LEVELS.TRACE < P.LEVELS.RESTORED,
      'a trace, not the full set',
    );
  },
);

await check('the level only grows as the story goes on, and always stays within 0..1', () => {
  const story: PlaceFacts[] = [
    dormant,
    awake,
    { ...awake, nameReturned: true },
    restored,
    { ...restored, nameReturned: true },
  ];
  let last = 0;
  for (const facts of story) {
    const level = placeTarget(facts);
    assert.ok(level >= 0 && level <= 1, `level ${level}`);
    assert.ok(level >= last - 1e-12, `${JSON.stringify(facts)} fell from ${last} to ${level}`);
    last = level;
  }
});

await check(
  'easing reaches the target in EASE_S for a full swing, never overshoots and never pops',
  () => {
    const dt = 1 / 60;
    let level = 0;
    let t = 0;
    while (level < 1 && t < P.EASE_S * 2) {
      const next = easeLevel(level, 1, dt);
      assert.ok(next - level <= dt / P.EASE_S + 1e-12, 'a step is no bigger than the rate allows');
      assert.ok(next <= 1 && next >= level, 'up only, within range');
      level = next;
      t += dt;
    }
    assert.ok(Math.abs(t - P.EASE_S) < 0.1, `took ${t.toFixed(2)} s, wanted ${P.EASE_S}`);
    // down, and a target it is already at
    assert.ok(easeLevel(0.5, 0, dt) < 0.5);
    assert.equal(easeLevel(0.4, 0.4, dt), 0.4);
    // a huge dt lands on the target and no further
    assert.equal(easeLevel(0, 0.3, 1000), 0.3);
    assert.equal(easeLevel(1, -5, 1000), 0);
  },
);

await check('fireflies come out at night, half at dusk and dawn, and not by day', () => {
  assert.equal(fireflyGate(0, 0), 0);
  assert.equal(fireflyGate(1, 0), 1);
  assert.equal(fireflyGate(0, 1), life.FIREFLIES.GOLDEN_SHARE);
  assert.equal(fireflyGate(1, 1), 1);
  let last = 0;
  for (let n = 0; n <= 1; n += 0.05) {
    const g = fireflyGate(n, 0);
    assert.ok(g >= last - 1e-12, 'more night, more fireflies');
    last = g;
  }
});

await check('every kind of place has its life: the chosen set', () => {
  assert.deepEqual([...LIFE_KINDS].sort(), [
    'monolith',
    'runestones',
    'sunken_ruin',
    'temple_ruin',
    'tree',
  ]);
  assert.deepEqual(lifeOf('tree'), { flock: 'songbird', cloud: 'leaves' });
  assert.deepEqual(lifeOf('temple_ruin'), { flock: 'dove' });
  assert.deepEqual(lifeOf('sunken_ruin'), { cloud: 'fireflies' });
  assert.deepEqual(lifeOf('runestones'), { cloud: 'ring-fireflies' });
  assert.deepEqual(lifeOf('monolith'), { cloud: 'motes' });
  assert.ok(isFireflyCloud('fireflies') && isFireflyCloud('ring-fireflies'));
  assert.ok(!isFireflyCloud('motes') && !isFireflyCloud('leaves') && !isFireflyCloud(undefined));
});

await check(
  'each cloud has the radius its place is given in the config, and only clouds have one',
  () => {
    assert.equal(cloudRadiusM('tree'), P.TREE.LEAF_SPREAD_M);
    assert.equal(cloudRadiusM('sunken_ruin'), P.SUNKEN.SPREAD_M);
    assert.equal(cloudRadiusM('runestones'), P.RUNESTONES.SPREAD_M);
    assert.equal(cloudRadiusM('monolith'), P.MONOLITH.SPREAD_M);
    assert.equal(cloudRadiusM('temple_ruin'), 0, 'doves have no cloud');
    for (const kind of LIFE_KINDS) {
      assert.equal(cloudRadiusM(kind) > 0, lifeOf(kind).cloud !== undefined, kind);
    }
  },
);

/** A place life that only records what it was told. */
function recorder() {
  const sited = new Map<LandmarkKind, { x: number; z: number; level: number }>();
  const targets = new Map<LandmarkKind, number>();
  const overrides = new Map<LandmarkKind, number | null>();
  const unsited: LandmarkKind[] = [];
  const placeLife: PlaceLife = {
    site: (kind, x, z, level) => {
      sited.set(kind, { x, z, level });
      targets.set(kind, level);
    },
    unsite: (kind) => {
      sited.delete(kind);
      unsited.push(kind);
    },
    setTarget: (kind, target) => targets.set(kind, target),
    setOverride: (kind, level) => overrides.set(kind, level),
    update: () => {},
    list: () => [],
    dispose: () => {},
  };
  return { placeLife, sited, targets, overrides, unsited };
}

/** A landmark runtime with the given state. */
function story(kinds: LandmarkKind[], woke: LandmarkKind[], done: LandmarkKind[]) {
  return {
    places: kinds.map((kind, i) => ({ kind, x: 100 + i * 10, z: 200 })),
    isAwake: (kind: LandmarkKind) => woke.includes(kind) || done.includes(kind),
    isRestored: (kind: LandmarkKind) => done.includes(kind),
  };
}

await check('a load shows every place at its level at once: nothing fades in', () => {
  const rec = recorder();
  const landmarks = story(['tree', 'monolith', 'sunken_ruin'], ['monolith'], ['tree']);
  createAmbientLife({ placeLife: rec.placeLife, landmarks, nameReturned: () => false });
  assert.equal(rec.sited.get('tree')?.level, P.LEVELS.RESTORED);
  assert.equal(rec.sited.get('monolith')?.level, P.LEVELS.AWAKE);
  assert.equal(rec.sited.get('sunken_ruin')?.level, 0);
  assert.equal(rec.sited.get('tree')?.x, 100);
  assert.equal(rec.sited.has('temple_ruin'), false, 'a place the map lacks gets no life');
});

await check('when the story moves the target follows and the level eases there', () => {
  const rec = recorder();
  const woke: LandmarkKind[] = [];
  const landmarks = story(['tree', 'monolith'], woke, []);
  let returned = false;
  const ambient = createAmbientLife({
    placeLife: rec.placeLife,
    landmarks: {
      places: landmarks.places,
      isAwake: (k) => woke.includes(k),
      isRestored: () => false,
    },
    nameReturned: () => returned,
  });
  ambient.update();
  assert.equal(rec.targets.get('tree'), 0);
  woke.push('tree');
  ambient.update();
  assert.equal(rec.targets.get('tree'), P.LEVELS.AWAKE);
  assert.equal(rec.targets.get('monolith'), 0);
  returned = true;
  ambient.update();
  assert.equal(
    rec.targets.get('monolith'),
    P.LEVELS.TRACE,
    'the name leaves its mark at a sleeping place too',
  );
  // the place was sited once, at its first level: the update only moved the target
  assert.equal(rec.sited.get('tree')?.level, 0);
});

await check(
  'DEV: made-up places fill in the kinds the map lacks, can be held, and go away again',
  () => {
    const rec = recorder();
    const ambient = createAmbientLife({
      placeLife: rec.placeLife,
      landmarks: story(['tree'], [], []),
      nameReturned: () => false,
    });
    const made = ambient.fakePlaces(50, 60, 20);
    assert.deepEqual([...made].sort(), ['monolith', 'runestones', 'sunken_ruin', 'temple_ruin']);
    for (const kind of made) {
      const at = rec.sited.get(kind);
      assert.ok(at && at.level === 1, `${kind} at full`);
      assert.ok(Math.abs(Math.hypot(at.x - 50, at.z - 60) - 20) < 1e-9, `${kind} on the ring`);
    }
    assert.equal(rec.sited.get('tree')?.level, 0, 'the real place is left alone');
    assert.equal(ambient.setPlaceLevel('monolith', 0.5), true);
    assert.equal(rec.overrides.get('monolith'), 0.5);
    ambient.clearFakes();
    assert.deepEqual([...rec.unsited].sort(), [...made].sort());
    assert.equal(
      ambient.setPlaceLevel('monolith', 1),
      false,
      'a place that is gone cannot be held',
    );
    assert.equal(ambient.setPlaceLevel('tree', 1), true);
  },
);

finish('all life checks passed');
