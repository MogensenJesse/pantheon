// scripts/checks/life/drift-check.ts — headless checks of the drifting specks: the tree grid, the rules and the speck maths.
// Run: node --experimental-strip-types scripts/checks/life/drift-check.ts
import assert from 'node:assert/strict';
import { life } from '../../../src/config/visual/life.ts';
import {
  type DriftWorld,
  fireflyShare,
  leafShare,
  pollenShare,
  shoreness,
} from '../../../src/life/driftRules.ts';
import { createTreeGrid, isBirchKey, type PlacedTree } from '../../../src/life/habitat.ts';
import {
  ageAt,
  type CloudShape,
  cloudFade,
  cloudPosition,
} from '../../../src/life/particles/cloudMath.ts';
import {
  advanceDrift,
  blinkAt,
  boxCoords,
  type DriftShape,
  driftPosition,
  edgeFade,
  orbPulled,
  seedAt,
} from '../../../src/life/particles/driftMath.ts';
import { check, finish } from '../lib/check.ts';

const H = life.HABITAT;
const L = life.LEAVES;
const P = life.POLLEN;

const calmDay: DriftWorld = { woods01: 1, windBoost: 1, rain01: 0, night01: 0, golden01: 0 };

await check(
  'the tree grid: empty ground is 0, a full cell is 1, and it is smooth across cells',
  () => {
    const none = createTreeGrid([]);
    assert.equal(none.density(100, 100), 0);
    assert.equal(none.birchShare(100, 100), 0);

    // a wood of 9 × FULL trees per cell fills the middle cell and its neighbours
    const trees: PlacedTree[] = [];
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        for (let i = 0; i < H.FULL_TREES_PER_CELL; i++) {
          trees.push({ key: 'fir_1', x: cx * H.CELL_M + 4 + i, z: cz * H.CELL_M + 4 });
        }
      }
    }
    const grid = createTreeGrid(trees);
    assert.equal(grid.density(4, 4), 1);
    // one cell away the neighbours still count; three cells away there is nothing
    assert.ok(grid.density(2 * H.CELL_M, 4) > 0 && grid.density(2 * H.CELL_M, 4) < 1);
    assert.equal(grid.density(5 * H.CELL_M, 4), 0);
    let last = 1;
    for (let x = 4; x <= 4 + 4 * H.CELL_M; x += 4) {
      const d = grid.density(x, 4);
      assert.ok(d <= last + 1e-12, `density rises moving away from the wood at ${x}`);
      last = d;
    }
  },
);

await check('the tree grid: birches are the share of the trees around a place', () => {
  assert.ok(isBirchKey('birch_2') && !isBirchKey('fir_1') && !isBirchKey('pine_3'));
  const trees: PlacedTree[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ key: 'birch_1', x: 10 + i, z: 10 })),
    ...Array.from({ length: 2 }, (_, i) => ({ key: 'fir_1', x: 10 + i, z: 12 })),
  ];
  const grid = createTreeGrid(trees);
  assert.equal(grid.birchShare(10, 10), 0.75);
  assert.equal(grid.birchShare(900, 900), 0, 'no trees, no birches');
});

await check('leaves: none without trees, a few in calm weather, a flurry in a gale', () => {
  assert.equal(leafShare({ ...calmDay, woods01: 0 }), 0);
  const calm = leafShare(calmDay);
  assert.ok(Math.abs(calm - L.CALM_SHARE) < 1e-12, `calm ${calm}`);
  let last = calm;
  for (let b = 1; b <= L.FULL_BOOST + 0.5; b += 0.1) {
    const s = leafShare({ ...calmDay, windBoost: b });
    assert.ok(s >= last - 1e-12, `boost ${b}`);
    assert.ok(s <= 1);
    last = s;
  }
  assert.equal(leafShare({ ...calmDay, windBoost: L.FULL_BOOST }), 1);
  assert.equal(leafShare({ ...calmDay, windBoost: 50 }), 1, 'beyond a gale there is no more');
});

await check('leaves: rain and night thin them out but never to nothing', () => {
  const gale = { ...calmDay, windBoost: L.FULL_BOOST };
  assert.ok(Math.abs(leafShare({ ...gale, rain01: 1 }) - L.RAIN_KEEP) < 1e-12);
  assert.ok(Math.abs(leafShare({ ...gale, night01: 1 }) - L.NIGHT_KEEP) < 1e-12);
  assert.ok(leafShare({ ...gale, rain01: 1, night01: 1 }) > 0);
  // out-of-range inputs cannot push it past the limits
  assert.ok(leafShare({ woods01: 9, windBoost: 9, rain01: -4, night01: -4, golden01: 0 }) <= 1);
});

await check('pollen: a still dry day over open ground; gone at night, in wind and in rain', () => {
  const open = { ...calmDay, woods01: 0 };
  assert.equal(pollenShare(open), 1);
  assert.ok(Math.abs(pollenShare(calmDay) - P.WOODS_KEEP) < 1e-12, 'less under trees');
  assert.equal(pollenShare({ ...open, night01: 1 }), 0);
  assert.equal(pollenShare({ ...open, windBoost: P.GONE_BOOST }), 0);
  assert.equal(pollenShare({ ...open, rain01: 1 }), 0);
  assert.ok(pollenShare({ ...open, golden01: 1 }) < 1, 'less at golden hour');
  assert.ok(
    pollenShare({ ...open, windBoost: 1.2 }) < 1 && pollenShare({ ...open, windBoost: 1.2 }) > 0,
  );
});

const shape: DriftShape = {
  boxM: L.boxM,
  heightM: L.heightM,
  fallMps: L.fallMps,
  wobbleM: L.wobbleM,
  wobbleHz: L.wobbleHz,
};
const centre = { x: 250, y: 12, z: -80 };

await check('specks: the seeds are well spread and the first share is the lowest `w`', () => {
  const n = L.count;
  const seen = new Set<number>();
  let lastW = -1;
  for (let i = 0; i < n; i++) {
    const s = seedAt(i, n);
    for (const v of [s.x, s.y, s.z, s.w]) assert.ok(v >= 0 && v < 1, `seed ${i}`);
    assert.ok(s.w > lastW, 'w rises with the index');
    lastW = s.w;
    seen.add(Math.round(s.x * 1e6));
  }
  assert.equal(seen.size, n, 'no two specks share a column');
});

await check('specks: always inside the box around the centre, within the wobble', () => {
  const slack = shape.wobbleM + 1e-9;
  for (let i = 0; i < L.count; i++) {
    const s = seedAt(i, L.count);
    for (const t of [0, 3.7, 91.2, 5000]) {
      const p = driftPosition(s, centre, 12.5, -3.25, t, shape);
      assert.ok(Math.abs(p.x - centre.x) <= shape.boxM / 2 + slack, `x of ${i}`);
      assert.ok(Math.abs(p.z - centre.z) <= shape.boxM / 2 + slack, `z of ${i}`);
      assert.ok(p.y >= centre.y - slack && p.y <= centre.y + shape.heightM + slack, `y of ${i}`);
    }
  }
});

await check('specks: stay put in the world when the box follows the camera', () => {
  // moving the centre by less than half a box moves a speck only by whole boxes (it wraps), never in between
  const moved = { x: centre.x + 7.3, y: centre.y, z: centre.z - 11.9 };
  for (let i = 0; i < L.count; i++) {
    const s = seedAt(i, L.count);
    const a = driftPosition(s, centre, 4, 9, 20, shape);
    const b = driftPosition(s, moved, 4, 9, 20, shape);
    const dx = (((a.x - b.x) % shape.boxM) + shape.boxM) % shape.boxM;
    const dz = (((a.z - b.z) % shape.boxM) + shape.boxM) % shape.boxM;
    assert.ok(Math.min(dx, shape.boxM - dx) < 1e-6, `x of ${i}: ${dx}`);
    assert.ok(Math.min(dz, shape.boxM - dz) < 1e-6, `z of ${i}: ${dz}`);
  }
});

await check(
  'specks: the wind carries them by exactly the drift, and the drift sums the same at any step',
  () => {
    const noWobble: DriftShape = { ...shape, wobbleM: 0 };
    const s = seedAt(5, L.count);
    const a = driftPosition(s, centre, 0, 0, 0, noWobble);
    const b = driftPosition(s, centre, 3, -2, 0, noWobble);
    // inside the box a speck moves by the drift (unless it wrapped past the rim in that step)
    const wraps = (d: number) => Math.abs(d) > shape.boxM / 2;
    assert.ok(wraps(b.x - a.x - 3) || Math.abs(b.x - a.x - 3) < 1e-9);
    assert.ok(wraps(b.z - a.z + 2) || Math.abs(b.z - a.z + 2) < 1e-9);

    const once = { x: 0, z: 0 };
    advanceDrift(once, -1, 0, 4, 1);
    const split = { x: 0, z: 0 };
    for (let i = 0; i < 60; i++) advanceDrift(split, -1, 0, 4, 1 / 60);
    assert.ok(Math.abs(once.x - split.x) < 1e-9 && once.x === -4);
    // a turning wind curves the drift: the sum of headings, not a jump
    const turn = { x: 0, z: 0 };
    advanceDrift(turn, -1, 0, 2, 1);
    advanceDrift(turn, 0, 1, 2, 1);
    assert.deepEqual(turn, { x: -2, z: 2 });
  },
);

await check('specks: they fall at the fall speed and start again at the top', () => {
  const noWobble: DriftShape = { ...shape, wobbleM: 0 };
  const s = seedAt(40, L.count);
  const y0 = driftPosition(s, centre, 0, 0, 0, noWobble).y;
  const y1 = driftPosition(s, centre, 0, 0, 1, noWobble).y;
  const fell = y0 - y1;
  // one second down by the fall speed, or (if it reached the ground) a wrap by the box height less that
  assert.ok(
    Math.abs(fell - shape.fallMps) < 1e-9 ||
      Math.abs(fell - (shape.fallMps - shape.heightM)) < 1e-9,
    `fell ${fell}`,
  );
  // over a whole fall every speck passes through every height once
  const period = shape.heightM / shape.fallMps;
  const c0 = boxCoords(s, centre, 0, 0, 0, shape);
  const c1 = boxCoords(s, centre, 0, 0, period, shape);
  assert.ok(Math.abs(c0.v - c1.v) < 1e-9 || Math.abs(Math.abs(c0.v - c1.v) - 1) < 1e-9);
});

await check('specks: the box edge fades them out, so the wrap is never seen', () => {
  assert.equal(edgeFade(0.5, 0.5), 1);
  assert.equal(edgeFade(1, 0.5), 0);
  assert.equal(edgeFade(0, 0), 0);
  let last = 1;
  for (let u = 0.5; u <= 1.0001; u += 0.02) {
    const f = edgeFade(u, 0.5);
    assert.ok(f <= last + 1e-12 && f >= 0, `u=${u}`);
    last = f;
  }
});

const F = life.FIREFLIES;
const night: DriftWorld = { woods01: 0, windBoost: 1, rain01: 0, night01: 1, golden01: 0 };

await check(
  'fireflies: a night thing; a few in the open, all of them in the woods and on the shore',
  () => {
    assert.equal(fireflyShare({ ...night, night01: 0 }), 0, 'none by day');
    assert.ok(Math.abs(fireflyShare(night) - F.OPEN_SHARE) < 1e-12, 'a few in the open');
    assert.equal(fireflyShare({ ...night, woods01: 1 }), 1);
    assert.equal(fireflyShare({ ...night, shore01: 1 }), 1);
    assert.ok(fireflyShare({ ...night, woods01: 0.5 }) > fireflyShare(night));
    // gales and rain keep them in, but never to nothing
    const full = { ...night, woods01: 1 };
    assert.ok(Math.abs(fireflyShare({ ...full, windBoost: F.GALE_BOOST }) - F.GALE_KEEP) < 1e-12);
    assert.ok(Math.abs(fireflyShare({ ...full, rain01: 1 }) - F.RAIN_KEEP) < 1e-12);
    assert.ok(fireflyShare({ ...full, rain01: 1, windBoost: 9 }) > 0);
    assert.ok(fireflyShare({ ...full, night01: 0.5 }) === 0.5, 'dusk brings them in gradually');
    // at golden hour the same share is out as at the places of power (one gate for both)
    assert.equal(fireflyShare({ ...full, night01: 0, golden01: 1 }), F.GOLDEN_SHARE);
    assert.equal(fireflyShare({ ...full, night01: 0, golden01: 0 }), 0, 'none by day');
  },
);

await check('the shore: full at the water line, gone a few metres from it', () => {
  assert.equal(shoreness(10, 10), 1);
  assert.equal(shoreness(10 + F.SHORE_BAND_M[1], 10), 0);
  assert.equal(shoreness(10 - F.SHORE_BAND_M[1], 10), 0, 'below the water counts the same');
  let last = 1;
  for (let d = 0; d <= 6; d += 0.25) {
    const sh = shoreness(10 + d, 10);
    assert.ok(sh <= last + 1e-12, `${d} m above the water`);
    last = sh;
  }
});

await check(
  'a firefly blinks: always between 0.1 and 1, out of step with the others, and it repeats',
  () => {
    const seen = new Set<number>();
    for (let i = 0; i < F.count; i++) {
      const w = seedAt(i, F.count).w;
      let max = 0;
      let min = 1;
      for (let t = 0; t < 1 / F.blinkHz; t += 0.05) {
        const b = blinkAt(w, t, F.blinkHz);
        assert.ok(b >= 0.1 - 1e-12 && b <= 1 + 1e-12, `firefly ${i} at ${t}`);
        max = Math.max(max, b);
        min = Math.min(min, b);
      }
      assert.ok(max > 0.95 && min < 0.15, `firefly ${i} glows and dims`);
      assert.ok(
        Math.abs(blinkAt(w, 3, F.blinkHz) - blinkAt(w, 3 + 1 / F.blinkHz, F.blinkHz)) < 1e-9,
      );
      seen.add(Math.round(blinkAt(w, 1, F.blinkHz) * 1000));
    }
    assert.ok(seen.size > 20, 'they are not in step');
  },
);

await check(
  'the orb draws creatures in: nothing at the rim or when they do not notice, a tight ring at full pull',
  () => {
    const orb = { x: 0, y: 1.2, z: 0 };
    const R = F.orbPullM;
    const far = { x: R + 3, y: 1.2, z: 0 };
    assert.deepEqual(
      orbPulled(far, orb, 1, R, life.ORB_NOTICE.INNER_SHARE, life.ORB_NOTICE.KEEP),
      far,
    );
    const near = { x: 5, y: 2, z: 1 };
    assert.deepEqual(
      orbPulled(near, orb, 0, R, life.ORB_NOTICE.INNER_SHARE, life.ORB_NOTICE.KEEP),
      near,
    );
    // at full pull inside the inner radius a speck keeps only KEEP of its distance
    const inner = { x: R * life.ORB_NOTICE.INNER_SHARE * 0.5, y: 1.2, z: 0 };
    const p = orbPulled(inner, orb, 1, R, life.ORB_NOTICE.INNER_SHARE, life.ORB_NOTICE.KEEP);
    assert.ok(Math.abs(p.x - inner.x * life.ORB_NOTICE.KEEP) < 1e-12);
    // continuous: the distance from the orb never decreases as a speck moves away
    let last = 0;
    for (let d = 0; d <= R + 2; d += 0.1) {
      const q = orbPulled(
        { x: d, y: orb.y, z: 0 },
        orb,
        1,
        R,
        life.ORB_NOTICE.INNER_SHARE,
        life.ORB_NOTICE.KEEP,
      );
      assert.ok(q.x >= last - 1e-12, `at ${d} m`);
      last = q.x;
    }
  },
);

const clouds = life.CLOUDS;
const place = { x: 100, y: 5, z: -40 };
const asShape = (c: (typeof clouds)[keyof typeof clouds]): CloudShape => c as CloudShape;

await check(
  'a cloud of fireflies stays within its spread, around the place, and a ring stays on its ring',
  () => {
    const shape = asShape(clouds.FIREFLY_SWIRL);
    for (let i = 0; i < clouds.FIREFLY_SWIRL.count; i++) {
      const s = seedAt(i, clouds.FIREFLY_SWIRL.count);
      for (const t of [0, 12.5, 400, 9000]) {
        const p = cloudPosition(s, place, -1, 0, 1, t, shape);
        const r = Math.hypot(p.x - place.x, p.z - place.z);
        assert.ok(r <= shape.spreadM + shape.wobbleM * 1.5 + 1e-9, `disc ${i} at ${t}: ${r}`);
        assert.ok(p.y >= place.y + 0.4 - 0.36 && p.y <= place.y + 0.4 + shape.heightM + 0.36);
        const q = cloudPosition(s, place, -1, 0, 1, t, shape, true);
        const rr = Math.hypot(q.x - place.x, q.z - place.z);
        assert.ok(
          rr >= shape.spreadM * 0.85 - shape.wobbleM * 1.5 &&
            rr <= shape.spreadM + shape.wobbleM * 1.5,
          `ring ${i} at ${t}: ${rr}`,
        );
        assert.equal(cloudFade(s, t, shape), 1);
      }
    }
  },
);

await check(
  'dust motes rise through the cloud and fade in and out; leaves fall from it downwind',
  () => {
    const rise = asShape(clouds.DUST_RISE);
    const shed = asShape(clouds.LEAF_SHED);
    for (let i = 0; i < clouds.DUST_RISE.count; i++) {
      const s = seedAt(i, clouds.DUST_RISE.count);
      for (const t of [0, 1.5, 33, 777]) {
        const p = cloudPosition(s, place, -1, 0, 1, t, rise);
        assert.ok(
          p.y >= place.y - 1e-9 && p.y <= place.y + rise.heightM + 1e-9,
          `mote ${i} at ${t}`,
        );
        const f = cloudFade(s, t, rise);
        assert.ok(f >= -1e-12 && f <= 1 + 1e-12);
      }
      // a mote is invisible at the instant it starts over again, so the loop cannot be seen
      const age0 = ageAt(s, 0, rise.lifeS);
      const tWrap = (1 - age0) * rise.lifeS;
      assert.ok(cloudFade(s, tWrap, rise) < 1e-6, `mote ${i} at its wrap`);
    }
    for (let i = 0; i < clouds.LEAF_SHED.count; i++) {
      const s = seedAt(i, clouds.LEAF_SHED.count);
      const tWrap = (1 - ageAt(s, 0, shed.lifeS)) * shed.lifeS;
      assert.ok(cloudFade(s, tWrap, shed) < 1e-6, `leaf ${i} at its wrap`);
      // later in its fall a leaf is lower and further downwind (the wind blows toward -x)
      const early = cloudPosition(s, place, -1, 0, 1, tWrap + 1, shed);
      const late = cloudPosition(s, place, -1, 0, 1, tWrap + 8, shed);
      assert.ok(late.y < early.y, `leaf ${i} falls`);
      assert.ok(late.x < early.x + shed.wobbleM * 2, `leaf ${i} drifts downwind`);
      // a gale carries the same leaf further
      const gale = cloudPosition(s, place, -1, 0, 2, tWrap + 8, shed);
      assert.ok(gale.x < late.x + shed.wobbleM * 0, `leaf ${i} is blown further in a gale`);
    }
  },
);

finish('all drift checks passed');
