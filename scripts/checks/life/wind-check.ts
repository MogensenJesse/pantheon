// scripts/checks/life/wind-check.ts — headless checks of the one wind: its heading, the storm boost and the gust before rain.
// Run: node --experimental-strip-types scripts/checks/life/wind-check.ts
import assert from 'node:assert/strict';
import { life } from '../../../src/config/visual/life.ts';
import { WEATHER } from '../../../src/config/weather.ts';
import { headingToXZ } from '../../../src/core/math/geom.ts';
import { followTarget } from '../../../src/core/math/scalar.ts';
import { preRainGust, windBoostTarget } from '../../../src/life/windGust.ts';
import { orbNear, wheatWave, wheatWind } from '../../../src/world/grass/wind/plantWind.ts';
import { createWeather } from '../../../src/world/weather/weather.ts';
import { check, finish } from '../lib/check.ts';

const W = life.WIND;
const ANCHOR = { x: 162, z: 561 };

await check(
  'the heading follows the clouds: 270° blows toward -x, 0° toward +z, always a unit vector',
  () => {
    const west = headingToXZ(270);
    assert.ok(Math.abs(west.x + 1) < 1e-9 && Math.abs(west.z) < 1e-9, `${west.x}, ${west.z}`);
    const north = headingToXZ(0);
    assert.ok(Math.abs(north.x) < 1e-9 && Math.abs(north.z - 1) < 1e-9);
    for (let deg = -720; deg <= 720; deg += 37) {
      const h = headingToXZ(deg);
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

await check(
  'wheat: a blade outside a field gets the wind unchanged, wheat rolls in waves and lies down when wet',
  () => {
    const base = {
      windX: -0.27,
      windZ: 0,
      dirX: -1,
      dirZ: 0,
      x: 30,
      z: 10,
      clockS: 4.2,
      wetness: 0,
    };
    const none = wheatWind({ ...base, mask: 0 });
    assert.equal(none.x, base.windX);
    assert.equal(none.z, base.windZ);
    // the wave modulates the lean from field to field and from moment to moment, and always runs -0.5..0.5
    const leans = new Set<number>();
    for (let t = 0; t < 6; t += 0.25) {
      const w = wheatWave(base.x, base.z, base.dirX, base.dirZ, t);
      assert.ok(w >= -0.5 && w <= 0.5);
      leans.add(Math.round(wheatWind({ ...base, clockS: t, mask: 1 }).x * 1000));
    }
    assert.ok(leans.size > 8, 'the wheat is moving');
    // even in a dead calm the breeze leans the wheat downwind a little
    let deepest = 0;
    for (let t = 0; t < 6; t += 0.25) {
      const calm = wheatWind({ ...base, windX: 0, clockS: t, mask: 1 });
      assert.ok(calm.x <= 0, `calm lean ${calm.x}`);
      deepest = Math.min(deepest, calm.x);
    }
    assert.ok(deepest < -0.03, `the breeze leans it ${deepest.toFixed(3)}`);
    // wet wheat leans further downwind than dry wheat, at every moment
    for (let t = 0; t < 6; t += 0.25) {
      const dry = wheatWind({ ...base, clockS: t, mask: 1 });
      const wet = wheatWind({ ...base, clockS: t, mask: 1, wetness: 1 });
      assert.ok(wet.x < dry.x, `t=${t}`);
    }
    // the wave travels downwind: a crest moves along the wind at wavelength / period
    const { WAVE_LENGTH_M: length, WAVE_PERIOD_S: period } = life.WHEAT_WIND;
    const step = 0.01;
    const crest = (t: number) => {
      let best = 0;
      let top = -1;
      for (let a = 0; a < length; a += step) {
        const w = wheatWave(-a, 0, -1, 0, t);
        if (w > top) {
          top = w;
          best = a;
        }
      }
      return best;
    };
    const dt = 0.4;
    const moved = (((crest(dt) - crest(0)) % length) + length) % length;
    const expected = (length / period) * dt;
    assert.ok(
      Math.abs(moved - expected) < step * 2,
      `the crest moved ${moved.toFixed(2)} m along the wind, not ${expected.toFixed(2)} m`,
    );
  },
);

await check('plants near the orb: full at the orb, none at the rim, smooth between', () => {
  assert.equal(orbNear(0, 5), 1);
  assert.equal(orbNear(5, 5), 0);
  assert.equal(orbNear(50, 5), 0);
  let last = 1;
  for (let d = 0; d <= 5; d += 0.25) {
    const n = orbNear(d, 5);
    assert.ok(n <= last + 1e-12, `at ${d} m`);
    last = n;
  }
});

finish('all wind checks passed');
