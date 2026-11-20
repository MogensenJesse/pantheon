// scripts/checks/underwater/underwater-check.ts — the water volume's fog path maths (mirror of underwaterTsl.ts) and its settings
import assert from 'node:assert/strict';
import { underwater } from '../../../src/config/visual/underwater.ts';
import {
  apparentSunElevationDeg,
  CRITICAL_COS,
  underwaterFogFactor,
  underwaterPathM,
} from '../../../src/rendering/underwater/underwaterMath.ts';
import { kelpCoverage } from '../../../src/world/underwater/kelpCoverage.ts';
import { SEABED_ROCK_KEYS, seabedRockEntities } from '../../../src/world/underwater/seabedRocks.ts';
import { check, finish } from '../lib/check.ts';

const at = (x: number, y: number, z: number) => ({ x, y, z });

await check('a ray that stays above the surface has no water in it', () => {
  assert.equal(underwaterPathM(at(0, 10, 0), at(30, 4, 40), 0), 0);
  assert.equal(underwaterPathM(at(0, 1, 0), at(5, 0.5, 5), 0), 0);
});

await check('a ray that stays under the surface is all water', () => {
  const d = Math.hypot(3, 4, 12);
  assert.ok(Math.abs(underwaterPathM(at(0, -2, 0), at(3, -6, 12), 0) - d) < 1e-9);
});

await check('looking straight down from above: the depth of the floor', () => {
  assert.ok(Math.abs(underwaterPathM(at(0, 5, 0), at(0, -8, 0), 0) - 8) < 1e-9);
});

await check('looking up from under the surface: the way to the surface only', () => {
  assert.ok(Math.abs(underwaterPathM(at(0, -3, 0), at(0, 20, 0), 0) - 3) < 1e-9);
  // slanted: 3 m down to the surface at 45 degrees is 3 * sqrt(2) of water
  assert.ok(Math.abs(underwaterPathM(at(0, -3, 0), at(10, 7, 0), 0) - 3 * Math.SQRT2) < 1e-9);
});

await check('the path follows the height of the surface', () => {
  assert.ok(Math.abs(underwaterPathM(at(0, 5, 0), at(0, -8, 0), 0.25) - 8.25) < 1e-9);
});

await check('fog grows with the path and never passes one', () => {
  assert.equal(underwaterFogFactor(0, 0.08), 0);
  const a = underwaterFogFactor(4, 0.08);
  const b = underwaterFogFactor(20, 0.08);
  assert.ok(a > 0 && a < b && b < 1);
  assert.ok(Math.abs(underwaterFogFactor(8, 0.08) - (1 - Math.exp(-0.64))) < 1e-12);
});

await check('the sun looks higher from under the surface, never lower', () => {
  assert.ok(Math.abs(apparentSunElevationDeg(90) - 90) < 1e-9);
  // a sun on the horizon is seen at 90 - asin(1 / 1.33) = 41.2 degrees
  assert.ok(Math.abs(apparentSunElevationDeg(0.001) - 41.25) < 0.1);
  for (const e of [5, 20, 33, 60]) {
    const a = apparentSunElevationDeg(e);
    assert.ok(a > e && a < 90, `${e} -> ${a}`);
  }
  assert.equal(apparentSunElevationDeg(-10), -10);
});

await check(
  'a widened window puts the sun further from the vertical, like the surface shader does',
  () => {
    // edgeCos = the real critical cos changes nothing
    assert.ok(
      Math.abs(apparentSunElevationDeg(33, CRITICAL_COS) - apparentSunElevationDeg(33)) < 1e-9,
    );
    // 0.35: a sun at 33 degrees is drawn about 55 degrees from the vertical (35 up), not 39 (51 up)
    const wide = apparentSunElevationDeg(33, 0.35);
    assert.ok(Math.abs(wide - 35) < 0.5, `${wide}`);
    assert.ok(wide < apparentSunElevationDeg(33));
    // overhead stays overhead whatever the window
    assert.ok(Math.abs(apparentSunElevationDeg(90, 0.35) - 90) < 1e-9);
  },
);

// A bowl: 6 m deep at the middle, rising to a beach (above the water) at 700 m from the origin.
const bowl = (x: number, z: number) => -6 + (Math.hypot(x, z) / 700) * 8;

await check('seabed rocks stand only in their band of depth, in the sea', () => {
  const rocks = seabedRockEntities(bowl, 0, 2048);
  assert.ok(rocks.length > 50, `${rocks.length}`);
  const [min, max] = underwater.seabed.rocks.depthM;
  for (const r of rocks) {
    const depth = -bowl(r.x, r.z);
    assert.ok(depth >= min && depth <= max, `${r.x},${r.z} depth ${depth}`);
    assert.ok(SEABED_ROCK_KEYS.includes(r.key), r.key);
  }
});

await check('seabed rocks are the same every time and never more than the cap', () => {
  const flat = () => -4;
  const a = seabedRockEntities(flat, 0, 2048);
  assert.deepEqual(a, seabedRockEntities(flat, 0, 2048));
  assert.ok(
    a.length <= underwater.seabed.rocks.maxCount &&
      a.length > 0.8 * underwater.seabed.rocks.maxCount,
  );
});

await check('seabed rocks keep clear of a landmark and of steep ground', () => {
  const flat = () => -4;
  const clear = underwater.seabed.rocks.landmarkClearM * 2;
  for (const r of seabedRockEntities(flat, 0, 2048, [{ x: 0, z: 0, scale: 2 }])) {
    assert.ok(Math.hypot(r.x, r.z) >= clear, `${r.x},${r.z}`);
  }
  const cliff = (x: number) => -4 + x * 2; // far steeper than maxSlope
  assert.equal(seabedRockEntities((x) => cliff(x), 100, 2048).length, 0);
});

await check('kelp grows only inside its band of depth and only in patches', () => {
  const { depthM, patchShare } = underwater.seabed.kelp;
  const mid = (depthM[0] + depthM[1]) / 2;
  assert.equal(kelpCoverage(depthM[0] - 0.1, 1, depthM, patchShare), 0);
  assert.equal(kelpCoverage(depthM[1] + 0.1, 1, depthM, patchShare), 0);
  assert.equal(kelpCoverage(mid, 1, depthM, patchShare), 1);
  assert.equal(kelpCoverage(mid, 0, depthM, patchShare), 0);
  // fades in over the first metre and out over the last two, never above 1
  const shallowEdge = kelpCoverage(depthM[0] + 0.5, 1, depthM, patchShare);
  assert.ok(shallowEdge > 0 && shallowEdge < 1, `${shallowEdge}`);
  const deepEdge = kelpCoverage(depthM[1] - 1, 1, depthM, patchShare);
  assert.ok(deepEdge > 0 && deepEdge < 1, `${deepEdge}`);
});

finish('all underwater checks passed');
