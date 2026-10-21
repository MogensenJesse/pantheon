// scripts/checks/landmarks/landmarks-check.ts — the Phase 0 landmarks: waking one, the gate, the guide target, the save slice
import assert from 'node:assert/strict';
import { allPropAssetEntries } from '../../../src/assets/assetManifest.ts';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { phase0Progress } from '../../../src/core/reveal/phase0Progress.ts';
import { pickGuideTarget } from '../../../src/entities/guideLine/guideTarget.ts';
import {
  LANDMARK_STAND_INS,
  standInProps,
  withLandmarkStandIns,
} from '../../../src/landmarks/landmarkStandIns.ts';
import {
  advanceDwell,
  allAwake,
  awaken,
  type DwellState,
  dwellProgress,
  initialLandmarks,
  isPhase0Complete,
  type LandmarkPlace,
  type LandmarkRules,
  nearestDormant,
  orderOf,
  parseLandmarks,
  stickyTarget,
} from '../../../src/landmarks/landmarks.ts';
import { LANDMARK_KINDS, type MapEntity } from '../../../src/map/MapTypes.ts';
import { captureProfile, parseProfile } from '../../../src/save/profile.ts';
import {
  LANDMARK_CAPTIONS,
  LANDMARK_CHAPTER_IDS,
  landmarkChapterId,
  MEMORY_FRAGMENTS,
} from '../../../src/story/fragments.ts';
import { check, expectOk, expectRefuses, finish } from '../lib/check.ts';
import { fakeSources, rawProfile } from '../lib/saveFixtures.ts';

const L = PHASE0.LANDMARK;
const rules: LandmarkRules = { radiusM: L.RADIUS_M, dwellS: L.DWELL_S };
// The places are far apart (100 m or more), so standing at IN is inside one reach and FAR inside none.
const IN = rules.radiusM / 2;
const FAR = 50;
const places: LandmarkPlace[] = [
  { kind: 'runestones', x: 0, z: 0 },
  { kind: 'tree', x: 100, z: 0 },
  { kind: 'monolith', x: 0, z: 200 },
];

/** Stands the orb at (x, z) for `seconds` in steps of `dt`; returns the kind that woke, if any. */
function stand(
  dwell: DwellState,
  state: ReturnType<typeof initialLandmarks>,
  x: number,
  z: number,
  seconds: number,
  dt = 0.1,
) {
  for (let t = 0; t < seconds; t += dt) {
    const woke = advanceDwell(dwell, places, state, x, z, dt, rules);
    if (woke) return woke;
  }
  return null;
}

await check('dwelling wakes a landmark only after the dwell time and only within reach', () => {
  const dwell: DwellState = {};
  const state = initialLandmarks();
  assert.equal(stand(dwell, state, FAR, 0, rules.dwellS * 10), null, 'too far from all');
  assert.equal(stand(dwell, state, IN, 0, rules.dwellS * 0.75), null, 'not long enough');
  assert.ok(dwellProgress(dwell, 'runestones', rules) > 0.5);
  assert.equal(stand(dwell, state, IN, 0, rules.dwellS * 0.5), 'runestones');
});

await check('leaving resets the dwell', () => {
  const dwell: DwellState = {};
  const state = initialLandmarks();
  stand(dwell, state, IN, 0, rules.dwellS * 0.75);
  stand(dwell, state, FAR, 0, 0.2);
  assert.equal(dwellProgress(dwell, 'runestones', rules), 0);
  assert.equal(stand(dwell, state, IN, 0, rules.dwellS * 0.75), null, 'starts over');
});

await check('an awake landmark does not count again, and the order of waking is kept', () => {
  let state = initialLandmarks();
  state = awaken(state, 'tree');
  state = awaken(state, 'runestones');
  assert.deepEqual(state.awakened, ['tree', 'runestones']);
  assert.equal(awaken(state, 'tree'), state, 'waking an awake one changes nothing');
  assert.equal(orderOf(state, 'tree'), 1);
  assert.equal(orderOf(state, 'runestones'), 2);
  assert.equal(orderOf(state, 'monolith'), 0);
  const dwell: DwellState = {};
  assert.equal(stand(dwell, state, IN, 0, rules.dwellS * 2), null, 'runestones is awake already');
  assert.equal(dwellProgress(dwell, 'runestones', rules), 0);
});

await check('any order works: the three can be woken from the last to the first', () => {
  const dwell: DwellState = {};
  let state = initialLandmarks();
  for (const [kind, x, z] of [
    ['monolith', 0, 200],
    ['tree', 100, 0],
    ['runestones', 0, 0],
  ] as const) {
    assert.equal(stand(dwell, state, x, z, rules.dwellS * 1.5), kind);
    state = awaken(state, kind);
  }
  assert.ok(allAwake(places, state));
  assert.deepEqual(state.awakened, ['monolith', 'tree', 'runestones']);
});

await check('the nearest dormant landmark is the guide line target once the orbs are gone', () => {
  let state = initialLandmarks();
  assert.equal(nearestDormant(places, state, 90, 5)?.kind, 'tree');
  state = awaken(state, 'tree');
  assert.equal(nearestDormant(places, state, 90, 5)?.kind, 'runestones');
  state = awaken(awaken(state, 'runestones'), 'monolith');
  assert.equal(nearestDormant(places, state, 0, 0), null);
});

await check(
  'the guide line keeps its landmark until it wakes, then takes the nearest dormant one',
  () => {
    let state = initialLandmarks();
    assert.equal(stickyTarget(places, state, null, 90, 5)?.kind, 'tree');
    // The orb walks closer to the runestones, but the line keeps leading to the tree.
    assert.equal(stickyTarget(places, state, 'tree', 10, 5)?.kind, 'tree');
    state = awaken(state, 'tree');
    assert.equal(stickyTarget(places, state, 'tree', 90, 5)?.kind, 'runestones');
    state = awaken(awaken(state, 'runestones'), 'monolith');
    assert.equal(stickyTarget(places, state, 'monolith', 0, 0), null);
  },
);

await check('the guide line follows the orbs in map order, then the landmark', () => {
  const orb = (absorbed: boolean, x: number) => ({ absorbed, worldPos: { x, y: 3, z: 0 } });
  const orbs = [orb(true, 1), orb(false, 2), orb(false, 3)];
  const landmark = () => ({ id: 'landmark:tree', x: 100, z: 50 });
  const ground = (x: number, z: number) => x / 10 + z / 100;
  assert.deepEqual(pickGuideTarget(orbs, landmark, ground, L.GUIDE_END_HEIGHT_M), {
    id: 'orb:1',
    x: 2,
    y: 3,
    z: 0,
  });
  orbs[1].absorbed = true;
  assert.equal(pickGuideTarget(orbs, landmark, ground, L.GUIDE_END_HEIGHT_M)?.id, 'orb:2');
  orbs[2].absorbed = true;
  assert.deepEqual(pickGuideTarget(orbs, landmark, ground, L.GUIDE_END_HEIGHT_M), {
    id: 'landmark:tree',
    x: 100,
    y: ground(100, 50) + L.GUIDE_END_HEIGHT_M,
    z: 50,
  });
  assert.equal(
    pickGuideTarget(orbs, null, ground, L.GUIDE_END_HEIGHT_M),
    null,
    'a map without landmarks ends with the orbs',
  );
  assert.equal(
    pickGuideTarget(orbs, () => null, ground, L.GUIDE_END_HEIGHT_M),
    null,
    'all landmarks awake',
  );
});

await check('the world lightens as the bar fills and stays lit from the sunrise on', () => {
  assert.equal(phase0Progress(0, 100, 0), 0);
  assert.equal(phase0Progress(25, 100, 0), 0.25);
  assert.equal(phase0Progress(100, 100, 0), 1);
  assert.equal(phase0Progress(120, 100, 0), 1);
  assert.equal(phase0Progress(10, 100, 1), 1, 'spending energy later does not darken the world');
  assert.equal(phase0Progress(5, 0, 0), 1, 'a zero cap does not divide by zero');
});

await check('every landmark kind has stand-in props, and each uses an asset the game loads', () => {
  const keys = new Set(allPropAssetEntries().map((entry) => entry.key));
  for (const kind of LANDMARK_KINDS) {
    const standIns = LANDMARK_STAND_INS[kind];
    assert.ok(standIns.length > 0, `${kind} has no stand-in`);
    for (const standIn of standIns)
      assert.ok(keys.has(standIn.key), `${standIn.key} is not an asset`);
  }
});

await check(
  'stand-in props follow the landmark: moved, turned, and the map is otherwise unchanged',
  () => {
    const runestones = { type: 'landmark', kind: 'runestones', x: 100, z: 50, rotY: 0 } as const;
    const props = standInProps(runestones);
    assert.equal(props.length, LANDMARK_STAND_INS.runestones.length);
    const ringM = Math.hypot(props[0].x - 100, props[0].z - 50);
    assert.ok(ringM > 0, 'the stones stand around the landmark, not on it');
    for (const prop of props)
      assert.ok(Math.abs(Math.hypot(prop.x - 100, prop.z - 50) - ringM) < 0.01);
    const turned = standInProps({ ...runestones, rotY: Math.PI / 2 });
    assert.ok(Math.abs(Math.hypot(turned[0].x - 100, turned[0].z - 50) - ringM) < 0.01);
    assert.ok(
      Math.hypot(turned[0].x - props[0].x, turned[0].z - props[0].z) > 0.1,
      'a quarter turn moves the first stone',
    );
    assert.ok(
      (standInProps({ type: 'landmark', kind: 'sunken_ruin', x: 0, z: 0 })[0].surfaceLift ?? 0) < 0,
      'sunk',
    );

    const prop: MapEntity = { type: 'prop', key: 'fir_1', x: 1, z: 2, rotY: 0, scale: 1 };
    const without = [prop];
    assert.deepEqual(withLandmarkStandIns(without), without, 'no landmarks, same entities');
    const withLandmark = withLandmarkStandIns([prop, runestones]);
    assert.equal(withLandmark.length, 2 + props.length);
    assert.equal(withLandmark.filter((e) => e.type === 'landmark').length, 1, 'the landmark stays');
  },
);

await check('each landmark woken tells the next chapter, whatever kind it is', () => {
  const ids = LANDMARK_KINDS.map((_, i) => landmarkChapterId(i + 1));
  assert.deepEqual(ids, [...LANDMARK_CHAPTER_IDS]);
  assert.equal(new Set(ids).size, ids.length, 'a chapter is told once');
  for (const id of ids) assert.ok(MEMORY_FRAGMENTS[id], `chapter ${id} has text`);
  assert.equal(landmarkChapterId(0), ids[0], 'clamped at the first');
  assert.equal(landmarkChapterId(9), ids[ids.length - 1], 'clamped at the last');
  for (const kind of LANDMARK_KINDS)
    assert.ok(LANDMARK_CAPTIONS[kind].length > 0, `${kind} caption`);
});

await check('the sunrise needs the full bar and every landmark of the map', () => {
  let state = initialLandmarks();
  assert.ok(!isPhase0Complete(100, 100, places, state), 'full bar, no landmark');
  state = awaken(awaken(awaken(state, 'tree'), 'runestones'), 'monolith');
  assert.ok(!isPhase0Complete(99, 100, places, state), 'all awake, bar short');
  assert.ok(isPhase0Complete(100, 100, places, state));
});

await check('a map without landmarks needs the bar alone', () => {
  assert.ok(isPhase0Complete(100, 100, [], initialLandmarks()));
  assert.ok(!isPhase0Complete(60, 100, [], initialLandmarks()));
});

await check('landmark state parses, and damaged states are refused', () => {
  const ok = expectOk(parseLandmarks({ awakened: ['tree', 'monolith'] }));
  assert.deepEqual(ok.landmarks.awakened, ['tree', 'monolith']);
  expectOk(parseLandmarks({ awakened: [] }));
  expectRefuses(parseLandmarks, [
    ['null', null],
    ['no list', {}],
    ['not a list', { awakened: 'tree' }],
    ['unknown kind', { awakened: ['spring'] }],
    ['twice', { awakened: ['tree', 'tree'] }],
    ['not a string', { awakened: [1] }],
  ]);
  for (const kind of LANDMARK_KINDS) expectOk(parseLandmarks({ awakened: [kind] }));
});

await check('the profile saves and restores the landmarks, and refuses a save without them', () => {
  const captured = captureProfile(fakeSources());
  assert.deepEqual(captured.landmarks.awakened, ['tree', 'monolith']);
  const parsed = expectOk(parseProfile(structuredClone(captured)));
  assert.deepEqual(parsed.profile.landmarks, captured.landmarks);
  expectOk(parseProfile(rawProfile()));
  expectRefuses(parseProfile, [
    ['no landmarks', rawProfile({ landmarks: undefined })],
    ['damaged landmarks', rawProfile({ landmarks: { awakened: ['nowhere'] } })],
  ]);
});

finish('all landmark checks passed');
