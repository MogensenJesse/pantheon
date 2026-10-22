// scripts/checks/map/prop-sway-check.ts — headless checks of tree sway: what the shader must do, proved on its CPU twin.
// Run: node --experimental-strip-types scripts/checks/map/prop-sway-check.ts
import assert from 'node:assert/strict';
import { ASSET_MANIFEST } from '../../../src/assets/assetManifest.ts';
import { props } from '../../../src/config/visual/props.ts';
import {
  gustAt,
  heightShare,
  type SwayInput,
  swayForKey,
  swayOffset,
  swayWeight,
  type TreeSway,
} from '../../../src/world/mapProps/sway/treeSway.ts';
import { check, finish } from '../lib/check.ts';

const S = props.sway;
const TREE: TreeSway = { heightM: 10, footY: 0, bend: 1, flutter: 1 };
const WEST = { windX: -1, windZ: 0 };

const input = (over: Partial<SwayInput> = {}): SwayInput => ({
  y: TREE.heightM,
  x: 120,
  z: -40,
  ...WEST,
  clockS: 0,
  boost: 1,
  lodBand: 0,
  ...over,
});

/** Every offset over a long stretch of the wind clock and a spread of places. */
function scan(
  over: Partial<SwayInput>,
  visit: (o: { x: number; y: number; z: number }, i: SwayInput) => void,
) {
  for (let t = 0; t < 600; t += 0.37) {
    for (let k = 0; k < 6; k++) {
      const i = input({ ...over, clockS: t, x: k * 53 - 120, z: k * -31 + 40 });
      visit(swayOffset(i, TREE), i);
    }
  }
}

await check('trees sway by their key; rocks, buildings and tiny props do not', () => {
  for (const key of [
    'fir_1',
    'fir_3',
    'pine_big_2',
    'pine_sapling_1',
    'birch_web',
    'birch_pendula',
  ]) {
    assert.ok(swayForKey(key, 10), key);
  }
  for (const key of ['stone_big_1', 'house_small', 'fence_post', 'well']) {
    assert.equal(swayForKey(key, 10), null, key);
  }
  assert.equal(swayForKey('fir_1', 0.2), null, 'a model with no height');
  // a new tree species must not silently stand still: every tree in the manifest has a profile
  for (const tree of ASSET_MANIFEST.trees) assert.ok(swayForKey(tree.key, 10), tree.key);
});

await check('species differ: birch gives the most, then pine, then fir', () => {
  const birch = swayForKey('birch_web', 10)!;
  const pine = swayForKey('pine_big_1', 10)!;
  const fir = swayForKey('fir_1', 10)!;
  assert.ok(birch.bend >= pine.bend && pine.bend >= fir.bend);
  assert.ok(birch.flutter > pine.flutter && pine.flutter > fir.flutter);
});

await check('the foot never moves, whatever the wind, the clock or the level of detail', () => {
  for (const lodBand of [0, 1, 2] as const) {
    scan({ y: 0, lodBand, boost: 2.5, orbDistM: 0 }, (o) => {
      // `=== 0` also accepts -0, which a zero times a negative direction gives
      assert.ok(o.x === 0 && o.y === 0 && o.z === 0, `${o.x}, ${o.y}, ${o.z}`);
    });
  }
});

await check('the lean grows with height: stiff trunk, moving crown', () => {
  assert.equal(heightShare(0, TREE), 0);
  assert.equal(heightShare(TREE.heightM * 4, TREE), 1);
  assert.ok(swayWeight(TREE.heightM * 0.5, TREE) < 0.25, 'half way up takes under a quarter');
  scan({ lodBand: 2 }, (_o, i) => {
    let last = -1;
    for (let y = 0; y <= TREE.heightM; y += 0.5) {
      const o = swayOffset({ ...i, y }, TREE);
      const downwind = o.x * i.windX + o.z * i.windZ;
      assert.ok(downwind >= last - 1e-12, `at ${y} m`);
      last = downwind;
    }
  });
});

await check(
  'it is gentle: the crown of a 10 m tree moves under 0.6 m in calm weather, under 1.5 m in a storm',
  () => {
    let calm = 0;
    let storm = 0;
    scan({}, (o) => {
      calm = Math.max(calm, Math.hypot(o.x, o.y, o.z));
    });
    scan({ boost: 2.5 }, (o) => {
      storm = Math.max(storm, Math.hypot(o.x, o.y, o.z));
    });
    assert.ok(calm > 0.05 && calm < 0.6, `calm ${calm.toFixed(3)} m`);
    assert.ok(storm > calm && storm < 1.5, `storm ${storm.toFixed(3)} m`);
  },
);

await check('trees lean downwind, whichever way it blows', () => {
  for (const [windX, windZ] of [
    [-1, 0],
    [1, 0],
    [0, 1],
    [Math.SQRT1_2, -Math.SQRT1_2],
  ] as const) {
    let sum = 0;
    let n = 0;
    scan({ windX, windZ, lodBand: 0 }, (o, i) => {
      sum += o.x * i.windX + o.z * i.windZ;
      n++;
    });
    assert.ok(sum / n > 0.05, `wind (${windX}, ${windZ}): mean lean ${(sum / n).toFixed(3)} m`);
  }
});

await check('a storm blows harder: the lean scales with the wind boost', () => {
  const calm = swayOffset(input({ lodBand: 2, clockS: 12.5 }), TREE);
  const storm = swayOffset(input({ lodBand: 2, clockS: 12.5, boost: 2 }), TREE);
  assert.ok(Math.abs(storm.x - 2 * calm.x) < 1e-12 && Math.abs(storm.z - 2 * calm.z) < 1e-12);
});

await check(
  'no pop: a tree has the same lean in every distance band, and lod0 only adds flutter',
  () => {
    const flutterBound = S.flutterM * TREE.flutter * 2.5 * (1 + S.orbGain) * 1.5;
    scan({ boost: 1 }, (_o, i) => {
      const a = swayOffset({ ...i, lodBand: 1 }, TREE);
      const b = swayOffset({ ...i, lodBand: 2 }, TREE);
      assert.deepEqual(a, b, 'lod1 and lod2 are the same');
      const c = swayOffset({ ...i, lodBand: 0 }, TREE);
      assert.ok(Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) <= flutterBound);
    });
  },
);

await check('trees next to each other move together: the gust is a smooth wave, not noise', () => {
  let worst = 0;
  for (let t = 0; t < 300; t += 0.5) {
    for (let x = -200; x < 200; x += 7) {
      const a = swayOffset(input({ lodBand: 2, clockS: t, x }), TREE);
      const b = swayOffset(input({ lodBand: 2, clockS: t, x: x + 2 }), TREE);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  assert.ok(worst < 0.05, `neighbours 2 m apart differ by ${worst.toFixed(3)} m`);
});

await check('the gust travels along the wind and has no preferred place', () => {
  // the wave: phase = along·k - clock·ω, so a crest moves downwind at wavelength / period
  const speed = S.waveLengthM / S.periodS;
  const crestAt = (t: number) => {
    let best = 0;
    let bestGust = -1;
    for (let along = 0; along < S.waveLengthM; along += 0.25) {
      const g = gustAt(along, 0, t).gust;
      if (g > bestGust) {
        bestGust = g;
        best = along;
      }
    }
    return best;
  };
  // after a short while the crest has moved by speed × dt (mod the wavelength)
  const dt = 1;
  const moved = (crestAt(dt) - crestAt(0) + S.waveLengthM) % S.waveLengthM;
  assert.ok(
    Math.abs(moved - speed * dt) < 1.5,
    `moved ${moved.toFixed(2)} m, expected ${(speed * dt).toFixed(2)} m`,
  );
  for (let t = 0; t < 60; t += 1.3) {
    const g = gustAt(17 * t, 3 * t, t);
    assert.ok(g.gust >= 0 && g.gust <= 1, `gust ${g.gust}`);
  }
});

await check('near the orb the crown flutters more, and only the near trees do', () => {
  let near = 0;
  let far = 0;
  scan({ orbDistM: 0 }, (o) => {
    near = Math.max(near, Math.hypot(o.x, o.z));
  });
  scan({ orbDistM: 100 }, (o) => {
    far = Math.max(far, Math.hypot(o.x, o.z));
  });
  assert.ok(near > far, `${near.toFixed(3)} vs ${far.toFixed(3)}`);
  // lod1 and lod2 ignore the orb entirely
  scan({ orbDistM: 0, lodBand: 1 }, (o, i) => {
    assert.deepEqual(o, swayOffset({ ...i, orbDistM: 100 }, TREE));
  });
});

finish('all tree sway checks passed');
