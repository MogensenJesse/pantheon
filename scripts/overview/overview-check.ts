// scripts/overview/overview-check.ts — headless checks of the overview camera's maths (pose, clamps,
// panning, the ray against the ground, the ground grab, when it may start).
//
//   node --experimental-strip-types scripts/overview/overview-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../src/config/phase0.ts';
import {
  canEnterOverview,
  clampDistance,
  clampFocus,
  grabShift,
  orbitPose,
  panStep,
  pitchRad,
  rayGroundHit,
  rayPlaneHit,
  smoothstep,
} from '../../src/overview/overviewMath.ts';

const O = PHASE0.OVERVIEW;
const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

// smoothstep: clamped, 0 and 1 at the ends, 0.5 in the middle.
near(smoothstep(-1), 0);
near(smoothstep(2), 1);
near(smoothstep(0.5), 0.5);

// orbitPose: yaw 0 puts the camera behind (+z) and above; the look point is the focus.
{
  const focus = { x: 10, y: 3, z: -4 };
  const p = orbitPose(focus, 0, pitchRad(), 100);
  near(p.position.x, 10);
  near(p.position.z, -4 + 100 * Math.cos(pitchRad()));
  near(p.position.y, 3 + 100 * Math.sin(pitchRad()));
  assert.deepEqual(p.look, focus);
  const q = orbitPose(focus, Math.PI / 2, pitchRad(), 100);
  near(q.position.x, 10 + 100 * Math.cos(pitchRad()));
  near(q.position.z, -4, 1e-9);
  // the camera is always `distance` away from the focus
  const d = Math.hypot(q.position.x - 10, q.position.y - 3, q.position.z + 4);
  near(d, 100);
}

// clampDistance
near(clampDistance(1), O.DISTANCE_MIN_M);
near(clampDistance(1e6), O.DISTANCE_MAX_M);
near(clampDistance(50), 50);

// clampFocus: inside stays, outside lands on the rim (village radius + margin).
{
  const village = { x: 100, z: -50, radiusM: 160 };
  assert.deepEqual(clampFocus(120, -40, village), { x: 120, z: -40 });
  const c = clampFocus(100 + 1000, -50, village);
  near(c.x, 100 + 160 + O.MARGIN_M);
  near(c.z, -50);
  const d = clampFocus(100, -50 - 5000, village);
  near(Math.hypot(d.x - 100, d.z + 50), 160 + O.MARGIN_M);
}

// panStep: W (dir.y = -1) moves where the camera looks; D moves to its right; speed grows with distance.
{
  const w0 = panStep({ x: 0, y: -1 }, 0, 100, 1);
  near(w0.x, 0);
  near(w0.z, -O.PAN_PER_DISTANCE * 100); // yaw 0 looks along -z
  const d0 = panStep({ x: 1, y: 0 }, 0, 100, 1);
  near(d0.x, O.PAN_PER_DISTANCE * 100);
  near(d0.z, 0);
  const wTurned = panStep({ x: 0, y: -1 }, Math.PI / 2, 100, 1);
  near(wTurned.x, -O.PAN_PER_DISTANCE * 100); // yaw 90° looks along -x
  near(wTurned.z, 0, 1e-9);
  assert.ok(
    Math.hypot(panStep({ x: 0, y: -1 }, 0, 200, 1).x, panStep({ x: 0, y: -1 }, 0, 200, 1).z) >
      Math.hypot(w0.x, w0.z),
  );
  assert.deepEqual(panStep({ x: 0, y: 0 }, 0.3, 100, 1), { x: 0, z: 0 });
}

// rayGroundHit: flat ground at y = 2, and a slope.
{
  const flat = () => 2;
  const dirDown = { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  const hit = rayGroundHit({ x: 0, y: 52, z: 0 }, dirDown, flat, 500);
  assert.ok(hit);
  near(hit.y, 2);
  near(hit.z, -50, 0.01);
  assert.equal(rayGroundHit({ x: 0, y: 52, z: 0 }, { x: 0, y: 1, z: 0 }, flat, 500), null); // up
  assert.equal(rayGroundHit({ x: 0, y: 52, z: 0 }, dirDown, flat, 10), null); // out of reach
  assert.equal(rayGroundHit({ x: 0, y: 1, z: 0 }, dirDown, flat, 500), null); // already under
  const slope = (_x: number, z: number) => -z * 0.2; // rises towards -z
  const s = rayGroundHit({ x: 0, y: 40, z: 0 }, dirDown, slope, 500);
  assert.ok(s);
  near(s.y, slope(s.x, s.z), 1e-6);
  // the point is on the ray: x = 0, and y - 40 = z (45 degrees)
  near(s.y - 40, s.z, 0.01);
}

// rayPlaneHit
{
  const hit = rayPlaneHit({ x: 1, y: 10, z: 1 }, { x: 0, y: -1, z: 0 }, 4);
  assert.deepEqual(hit, { x: 1, y: 4, z: 1 });
  assert.equal(rayPlaneHit({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 4), null);
  assert.equal(rayPlaneHit({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, 4), null);
}

// grabShift: pressing on a point and dragging so that another point is under the mouse moves the
// focus by (grabbed - now); the grabbed point is then back under the mouse.
assert.deepEqual(grabShift({ x: 5, y: 0, z: 5 }, { x: 8, y: 0, z: 3 }), { x: -3, z: 2 });

// canEnterOverview
const reach = 6 + O.REACH_M;
assert.equal(canEnterOverview({ converted: true, templeDistanceM: reach, templeRadiusM: 6 }), true);
assert.equal(
  canEnterOverview({ converted: true, templeDistanceM: reach + 0.1, templeRadiusM: 6 }),
  false,
);
assert.equal(canEnterOverview({ converted: false, templeDistanceM: 1, templeRadiusM: 6 }), false);
assert.equal(canEnterOverview({ converted: true, templeDistanceM: null, templeRadiusM: 6 }), false);

console.log('overview-check: ok');
