// scripts/checks/underwater/underwater-check.ts — the water volume's fog path maths (mirror of underwaterTsl.ts) and its settings
import assert from 'node:assert/strict';
import {
  apparentSunElevationDeg,
  CRITICAL_COS,
  underwaterFogFactor,
  underwaterPathM,
} from '../../../src/rendering/underwater/underwaterMath.ts';
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

await check('the surface moves with the tide', () => {
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

finish('all underwater checks passed');
