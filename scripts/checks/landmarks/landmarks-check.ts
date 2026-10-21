// scripts/checks/landmarks/landmarks-check.ts — the Phase 0 landmarks: waking one, the gate, the save slice
import assert from 'node:assert/strict';
import { phase0Progress } from '../../../src/core/reveal/phase0Progress.ts';
import { pickGuideTarget } from '../../../src/entities/guideLine/guideTarget.ts';
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
import { LANDMARK_KINDS } from '../../../src/map/MapTypes.ts';
import { captureProfile, parseProfile } from '../../../src/save/profile.ts';
import { check, expectOk, expectRefuses, finish } from '../lib/check.ts';
import { fakeSources, rawProfile } from '../lib/saveFixtures.ts';

const rules: LandmarkRules = { radiusM: 8, dwellS: 4 };
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
  assert.equal(stand(dwell, state, 50, 0, 60), null, 'too far from both');
  assert.equal(stand(dwell, state, 5, 0, 3), null, 'not long enough');
  assert.ok(dwellProgress(dwell, 'runestones', rules) > 0.5);
  assert.equal(stand(dwell, state, 5, 0, 2), 'runestones');
});

await check('leaving resets the dwell', () => {
  const dwell: DwellState = {};
  const state = initialLandmarks();
  stand(dwell, state, 5, 0, 3);
  stand(dwell, state, 50, 0, 0.2);
  assert.equal(dwellProgress(dwell, 'runestones', rules), 0);
  assert.equal(stand(dwell, state, 5, 0, 3), null, 'starts over');
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
  assert.equal(stand(dwell, state, 5, 0, 10), null, 'runestones is awake already');
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
    assert.equal(stand(dwell, state, x, z, 5), kind);
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
  assert.deepEqual(pickGuideTarget(orbs, landmark, ground, 1.5), { id: 'orb:1', x: 2, y: 3, z: 0 });
  orbs[1].absorbed = true;
  assert.equal(pickGuideTarget(orbs, landmark, ground, 1.5)?.id, 'orb:2');
  orbs[2].absorbed = true;
  assert.deepEqual(pickGuideTarget(orbs, landmark, ground, 1.5), {
    id: 'landmark:tree',
    x: 100,
    y: 10 + 0.5 + 1.5,
    z: 50,
  });
  assert.equal(
    pickGuideTarget(orbs, null, ground, 1.5),
    null,
    'a map without landmarks ends with the orbs',
  );
  assert.equal(
    pickGuideTarget(orbs, () => null, ground, 1.5),
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

await check('the sunrise needs the full bar and every landmark of the map', () => {
  let state = initialLandmarks();
  assert.ok(!isPhase0Complete(100, 100, places, state), 'full bar, no landmark');
  state = awaken(awaken(awaken(state, 'tree'), 'runestones'), 'monolith');
  assert.ok(!isPhase0Complete(99, 100, places, state), 'all awake, bar short');
  assert.ok(isPhase0Complete(100, 100, places, state));
});

await check('a map without landmarks keeps the old rule: the bar alone', () => {
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
