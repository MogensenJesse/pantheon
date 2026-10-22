// scripts/checks/life/wind-check.ts — headless checks of the one wind: its heading, the storm boost and the gust before rain.
// Run: node --experimental-strip-types scripts/checks/life/wind-check.ts
import assert from 'node:assert/strict';
import { life } from '../../../src/config/visual/life.ts';
import { WEATHER } from '../../../src/config/weather.ts';
import {
  followTarget,
  preRainGust,
  windBoostTarget,
  windHeading,
} from '../../../src/life/windGust.ts';
import { createWeather } from '../../../src/world/weather/weather.ts';
import { check, finish } from '../lib/check.ts';

const W = life.WIND;
const ANCHOR = { x: 162, z: 561 };

await check(
  'the heading follows the clouds: 270° blows toward -x, 0° toward +z, always a unit vector',
  () => {
    const west = windHeading(270);
    assert.ok(Math.abs(west.x + 1) < 1e-9 && Math.abs(west.z) < 1e-9, `${west.x}, ${west.z}`);
    const north = windHeading(0);
    assert.ok(Math.abs(north.x) < 1e-9 && Math.abs(north.z - 1) < 1e-9);
    for (let deg = -720; deg <= 720; deg += 37) {
      const h = windHeading(deg);
      assert.ok(Math.abs(Math.hypot(h.x, h.z) - 1) < 1e-9, `${deg}°`);
    }
  },
);

await check('the gust before rain is the rain still to come: never negative, never above 1', () => {
  assert.equal(preRainGust(0, 0), 0);
  assert.equal(preRainGust(0.5, 0.2), 0, 'rain ending is not a gust');
  assert.ok(Math.abs(preRainGust(0.1, 0.4) - 0.3) < 1e-12);
  assert.equal(preRainGust(0, 5), 1);
});

await check(
  'the boost is 1 in calm weather and grows with rain and with the gust before it',
  () => {
    assert.equal(windBoostTarget(0, 0), 1);
    let last = 1;
    for (let r = 0.1; r <= 1.0001; r += 0.1) {
      const b = windBoostTarget(r, 0);
      assert.ok(b > last, `rain ${r}`);
      last = b;
    }
    assert.ok(windBoostTarget(0, 1) > windBoostTarget(0, 0.5));
    assert.ok(Math.abs(windBoostTarget(1, 1) - (1 + W.STORM_GAIN + W.PRE_RAIN_GAIN)) < 1e-12);
    // out-of-range inputs cannot push it past the limits
    assert.equal(windBoostTarget(9, 9), windBoostTarget(1, 1));
    assert.equal(windBoostTarget(-3, -3), 1);
  },
);

await check(
  'the boost follows its target without overshoot and does not depend on the frame rate',
  () => {
    let b = 1;
    // a minute and a half at 60 frames a second is many time constants
    for (let i = 0; i < 5400; i++) {
      const next = followTarget(b, 2, 1 / 60, W.SMOOTH_S);
      assert.ok(next >= b && next <= 2, `step ${i}`);
      b = next;
    }
    assert.ok(Math.abs(b - 2) < 0.01, 'converged');
    // one 0.1 s step equals two 0.05 s steps
    const once = followTarget(1, 3, 0.1, W.SMOOTH_S);
    const twice = followTarget(followTarget(1, 3, 0.05, W.SMOOTH_S), 3, 0.05, W.SMOOTH_S);
    assert.ok(Math.abs(once - twice) < 1e-12);
    assert.equal(followTarget(1.5, 3, 0, W.SMOOTH_S), 1.5, 'no time passed');
    assert.equal(followTarget(1.5, 3, 1, 0), 3, 'no smoothing: straight to the target');
  },
);

await check(
  'real weather: the gust builds in the minute before a front arrives and is zero in clear weather',
  () => {
    const weather = createWeather({
      anchorX: ANCHOR.x,
      anchorZ: ANCHOR.z,
      seed: 7,
      windDirectionDeg: 270,
    });
    const gust = (t: number) =>
      preRainGust(
        weather.rainAt(ANCHOR.x, ANCHOR.z, t),
        weather.rainAt(ANCHOR.x, ANCHOR.z, t + W.PRE_RAIN_LEAD_S),
      );
    // the first second the rain at the anchor passes a light shower
    let start = -1;
    for (let t = 0; t < 40 * WEATHER.DAY_S; t++) {
      if (weather.rainAt(ANCHOR.x, ANCHOR.z, t) > 0.05) {
        start = t;
        break;
      }
    }
    assert.ok(start > W.PRE_RAIN_LEAD_S * 2, `first rain at ${start} s`);
    // before any front there is no gust, a minute before the rain there is one, and it ends when the rain is steady
    assert.equal(gust(start - W.PRE_RAIN_LEAD_S * 4), 0, 'clear weather');
    assert.ok(gust(start - 10) > 0, 'rain a few seconds away');
    let peak = 0;
    for (let t = start - W.PRE_RAIN_LEAD_S; t < start + 600; t++) peak = Math.max(peak, gust(t));
    assert.ok(peak > 0.1 && peak <= 1, `peak gust ${peak}`);
  },
);

finish('all wind checks passed');
