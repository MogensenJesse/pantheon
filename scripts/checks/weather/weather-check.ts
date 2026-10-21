// scripts/checks/weather/weather-check.ts — headless checks of the weather: fronts as a pure function of the clock and a place, wet ground, the rain-power hooks.
// Run: node --experimental-strip-types scripts/checks/weather/weather-check.ts
import assert from 'node:assert/strict';
import { VILLAGE } from '../../../src/config/village.ts';
import { sky } from '../../../src/config/visual/sky.ts';
import { WEATHER } from '../../../src/config/weather.ts';
import {
  createWeather,
  type Front,
  frontRainAt,
  stepWetness,
} from '../../../src/world/weather/weather.ts';
import { check, finish } from '../lib/check.ts';

const W = WEATHER;
const DAY_S = W.DAY_S;
const ANCHOR = { x: 162, z: 561 };
const make = (seed = 7) =>
  createWeather({ anchorX: ANCHOR.x, anchorZ: ANCHOR.z, seed, windDirectionDeg: 270 });

/** The rain at the anchor each second from `fromS` to `toS`. */
function trace(
  weather: ReturnType<typeof make>,
  fromS: number,
  toS: number,
  x = ANCHOR.x,
  z = ANCHOR.z,
) {
  const out: number[] = [];
  for (let t = fromS; t < toS; t++) out.push(weather.rainAt(x, z, t));
  return out;
}

await check(
  'the weather is a pure function of the clock: same inputs, same sky, and nothing to save',
  () => {
    const a = make();
    const b = make();
    for (let t = 0; t < 40 * DAY_S; t += 97)
      assert.equal(a.rainAt(300, 400, t), b.rainAt(300, 400, t));
    // asking out of order changes nothing
    const c = make();
    assert.equal(c.rainAt(300, 400, 30 * DAY_S + 5), a.rainAt(300, 400, 30 * DAY_S + 5));
    assert.equal(c.rainAt(300, 400, 3 * DAY_S + 5), a.rainAt(300, 400, 3 * DAY_S + 5));
    // another map's seed gives another sky
    const other = make(8);
    let differs = 0;
    for (let d = 0; d < 60; d++) if (!!a.frontOfDay(d) !== !!other.frontOfDay(d)) differs++;
    assert.ok(differs > 10, `${differs} days differ`);
  },
);

await check('a new game starts dry', () => {
  const w = make();
  for (let d = 0; d < W.CALM_DAYS; d++) assert.equal(w.frontOfDay(d), null);
  assert.equal(Math.max(...trace(w, 0, W.CALM_DAYS * DAY_S)), 0);
});

await check(
  'every front reaches the village (the anchor) with heavy rain, whatever its path',
  () => {
    const w = make();
    let seen = 0;
    for (let d = W.CALM_DAYS; d < 200; d++) {
      const f = w.frontOfDay(d);
      if (!f) continue;
      seen++;
      const atCross = frontRainAt(f, ANCHOR.x, ANCHOR.z, f.crossS);
      assert.ok(atCross >= W.PEAK.MIN - 1e-9, `day ${d}: only ${atCross.toFixed(2)} at the anchor`);
      assert.ok(Math.abs(f.dirX * f.dirX + f.dirZ * f.dirZ - 1) < 1e-9, 'a unit heading');
      // downwind, within the jitter: wind toward 270 degrees is (sin, cos) = (-1, 0)
      const cos = -f.dirX;
      assert.ok(
        cos >= Math.cos((W.HEADING_JITTER_DEG * Math.PI) / 180) - 1e-9,
        `day ${d}: heading off the wind`,
      );
    }
    assert.ok(seen > 40);
  },
);

await check(
  'rain is local: while it pours on the village a place far to the side can be dry',
  () => {
    const w = make();
    let found = 0;
    for (let d = W.CALM_DAYS; d < 200 && found < 5; d++) {
      const f = w.frontOfDay(d);
      if (!f) continue;
      const t = f.crossS;
      const side = 2 * W.RADIUS_M.MAX;
      const sideX = ANCHOR.x - f.dirZ * side;
      const sideZ = ANCHOR.z + f.dirX * side;
      assert.ok(w.rainAt(ANCHOR.x, ANCHOR.z, t) >= W.PEAK.MIN - 1e-9);
      assert.equal(w.rainAt(sideX, sideZ, t), 0, 'dry far to the side');
      found++;
    }
    assert.equal(found, 5);
    // and the front is moving: ahead of it the rain comes later than behind it
    const f = w.frontOfDay(
      Array.from({ length: 100 }, (_, i) => i + 1).find((d) => w.frontOfDay(d))!,
    )!;
    const aheadX = ANCHOR.x + f.dirX * 900;
    const aheadZ = ANCHOR.z + f.dirZ * 900;
    assert.ok(w.rainAt(aheadX, aheadZ, f.crossS) < w.rainAt(ANCHOR.x, ANCHOR.z, f.crossS));
    assert.ok(w.rainAt(aheadX, aheadZ, f.crossS + 900 / f.speed) > 0.5, 'it gets there in the end');
  },
);

await check('the sky closes in before the rain, and is overcast wherever it rains', () => {
  const w = make();
  let seen = 0;
  for (let d = W.CALM_DAYS; d < 120; d++) {
    const f = w.frontOfDay(d);
    if (!f || w.frontOfDay(d - 1) || w.frontOfDay(d + 1)) continue; // one front at a time
    seen++;
    const t0 = f.crossS - 1500;
    let firstRain = -1;
    let firstSky = -1;
    for (let t = t0; t < f.crossS + 1500; t++) {
      const rain = w.rainAt(ANCHOR.x, ANCHOR.z, t);
      const sky = w.overcastAt(ANCHOR.x, ANCHOR.z, t);
      assert.ok(sky >= 0 && sky <= 1);
      assert.ok(sky >= rain / f.peak - 1e-6 || rain < 0.01, `day ${d}: raining under a clear sky`);
      if (firstRain < 0 && rain > 0.05) firstRain = t;
      if (firstSky < 0 && sky > 0.05) firstSky = t;
    }
    assert.ok(firstSky >= 0 && firstSky < firstRain, `day ${d}: the sky closed before the rain`);
  }
  assert.ok(seen > 20);
  // a hole in the weather opens the sky too
  const f = w.frontOfDay(
    Array.from({ length: 100 }, (_, i) => i + 1).find((x) => w.frontOfDay(x))!,
  )!;
  w.clearSkies({
    x: ANCHOR.x,
    z: ANCHOR.z,
    radius: 300,
    edgeM: 100,
    fromS: f.crossS - 10,
    untilS: f.crossS + 10,
  });
  assert.equal(w.overcastAt(ANCHOR.x, ANCHOR.z, f.crossS), 0);
  assert.ok(
    w.overcastAt(ANCHOR.x, ANCHOR.z, f.crossS + 20) > 0,
    'overcast while the front is over',
  );
});

await check(
  'the rain powers: a called front rains where it is aimed, clear skies cut a hole and time ends it',
  () => {
    const w = make();
    const day = Array.from({ length: 50 }, (_, i) => i + W.CALM_DAYS).find(
      (x) => !w.frontOfDay(x) && !w.frontOfDay(x - 1) && !w.frontOfDay(x + 1),
    )!;
    const t = (day + 0.5) * DAY_S;
    assert.equal(w.rainAt(500, 500, t), 0);
    const called: Front = {
      x: 500,
      z: 500,
      dirX: 1,
      dirZ: 0,
      speed: 1,
      radius: 400,
      peak: 1,
      crossS: t,
    };
    w.addFront(called);
    assert.equal(w.rainAt(500, 500, t), 1);
    assert.equal(w.rainAt(500 + 800, 500, t), 0);
    assert.ok(w.rainAt(500 + 100, 500, t + 100) > 0.9, 'it moves');
    w.clearSkies({ x: 500, z: 500, radius: 300, edgeM: 100, fromS: t - 10, untilS: t + 200 });
    assert.equal(w.rainAt(500, 500, t), 0, 'a hole in the rain');
    assert.ok(w.rainAt(500 + 350, 500, t) > 0, 'outside the hole it still rains');
    assert.ok(
      w.rainAt(500 + 100, 500, t + 250) > 0.9 - 1e-9,
      'the sky closes again when the time is up',
    );
    w.reset();
    assert.equal(w.rainAt(500, 500, t), 0);
  },
);

await check(
  'wet ground soaks and dries in the configured time, and holds under steady rain',
  () => {
    let wet = 0;
    let seconds = 0;
    while (wet < 1 - 1e-9 && seconds < 1000) {
      wet = stepWetness(wet, 1, 1);
      seconds++;
    }
    assert.ok(Math.abs(seconds - W.WET.RISE_S) <= 1, `${seconds} s to soak`);
    seconds = 0;
    while (wet > 1e-9 && seconds < 5000) {
      wet = stepWetness(wet, 0, 1);
      seconds++;
    }
    assert.ok(Math.abs(seconds - W.WET.DRY_S) <= 2, `${seconds} s to dry`);
    assert.equal(
      stepWetness(0.5, 0.5, 10),
      0.5,
      'steady light rain holds the ground at that wetness',
    );
    assert.ok(stepWetness(0.9, 0.3, 1) >= 0.3, 'drying stops at the rain falling now');
  },
);

await check('the three configs agree on the length of a game day', () => {
  assert.equal(W.DAY_S, sky.cycle.dayDurationSec, 'weather vs sky');
  assert.equal(VILLAGE.ECONOMY.DAY_S, sky.cycle.dayDurationSec, 'village vs sky');
});

finish('all weather checks passed');
