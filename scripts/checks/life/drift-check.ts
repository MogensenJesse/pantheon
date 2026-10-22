// scripts/checks/life/drift-check.ts — headless checks of the drifting specks: the tree grid, the rules and the speck maths.
// Run: node --experimental-strip-types scripts/checks/life/drift-check.ts
import assert from 'node:assert/strict';
import { life } from '../../../src/config/visual/life.ts';
import { type DriftWorld, leafShare, pollenShare } from '../../../src/life/driftRules.ts';
import { createTreeGrid, isBirchKey, type PlacedTree } from '../../../src/life/habitat.ts';
import {
  advanceDrift,
  boxCoords,
  type DriftShape,
  driftPosition,
  edgeFade,
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

finish('all drift checks passed');
