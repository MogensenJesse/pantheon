// scripts/checks/water/water-waves-check.ts — the swell maths (twin of tsl/waterWavesTsl.ts), the shore front curves and their settings
import assert from 'node:assert/strict';
import { water } from '../../../src/config/visual/water.ts';
import {
  createWaterDiscGeometry,
  waterDiscRadii,
} from '../../../src/world/water/mesh/waterDiscGeometry.ts';
import {
  bakeShoreField,
  lakeShareAt,
  SHORE_FIELD_SIZE,
  shoreDistanceAt,
} from '../../../src/world/water/waves/shoreFieldBake.ts';
import {
  distanceFade,
  edgePulse,
  effectiveShoalDepthM,
  lakeMul,
  openSeaGrow,
  runUpM,
  shoalFactor,
  shoreDerived,
  shoreFrontM,
  swashProfile,
  swashPulse,
  swellHeightAt,
  swellMaxHeightM,
  swellTable,
  swellTotalHeightM,
  uprush01,
  waveEnergy,
  wetHeightM,
  whitecapStrength,
} from '../../../src/world/water/waves/waveMath.ts';
import { check, finish } from '../lib/check.ts';

const swell = water.waves.swell;
const shore = water.waves.shore;
const table = swellTable(swell);
const heightAt = (x: number, t: number, depthM: number, energy: number, distM = 0, calm = 1) =>
  swellHeightAt(swell, table, x, t, depthM, energy, distM, calm);

// The shore-field tests bake square maps of 256 m: land is 1 m high, water -1 m, the waterline 0.
const worldSize = 256;
const gridSize = 257;
function bakeTestField(height: (x: number, z: number) => number) {
  const heights = new Float32Array(gridSize * gridSize);
  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize; i++) {
      const x = -worldSize / 2 + (i * worldSize) / (gridSize - 1);
      const z = -worldSize / 2 + (j * worldSize) / (gridSize - 1);
      heights[j * gridSize + i] = height(x, z);
    }
  }
  return bakeShoreField({ heights, gridSize, heightScale: 1, waterLevelM: 0, worldSize });
}

await check('the energy is 0 in calm weather, 1 at the full boost, and never leaves 0..1', () => {
  assert.equal(waveEnergy(1, swell.fullEnergyBoost), 0);
  assert.equal(waveEnergy(swell.fullEnergyBoost, swell.fullEnergyBoost), 1);
  assert.equal(waveEnergy(0.5, swell.fullEnergyBoost), 0);
  assert.equal(waveEnergy(9, swell.fullEnergyBoost), 1);
});

await check(
  'the table is deterministic, its shares add to 1 and it is the same on every call',
  () => {
    const again = swellTable(swell);
    assert.deepEqual(again, table);
    assert.ok(Math.abs(table.reduce((s, w) => s + w.amp, 0) - 1) < 1e-12);
    for (const w of table) assert.ok(w.k > 0 && w.omega > 0);
  },
);

await check('the longer the wave, the faster it moves', () => {
  const byLength = [...swell.components].map((c, i) => ({
    L: c.wavelengthM,
    v: table[i].omega / table[i].k,
  }));
  byLength.sort((a, b) => a.L - b.L);
  for (let i = 1; i < byLength.length; i++) assert.ok(byLength[i].v > byLength[i - 1].v);
});

await check('the height never passes the tallest swell, in calm or in a storm', () => {
  for (const energy of [0, 0.5, 1]) {
    const cap = swellMaxHeightM(swell, energy);
    for (let i = 0; i < 4000; i++) {
      const h = heightAt(i * 3.7 - 500, i * 0.173, 30, energy);
      assert.ok(Math.abs(h) <= cap + 1e-9, `${h} > ${cap}`);
    }
  }
});

await check(
  'the storm swell is taller than the calm one, and whitecaps only come with energy',
  () => {
    assert.ok(swellTotalHeightM(swell, 1) > swellTotalHeightM(swell, 0));
    assert.equal(whitecapStrength(swell, 0), 0);
    assert.ok(
      whitecapStrength(swell, 1) > 0 && whitecapStrength(swell, 1) <= swell.whitecap.amount,
    );
    assert.equal(whitecapStrength({ ...swell, enabled: false }, 1), 0);
  },
);

await check('no swell when it is switched off or over water of no depth', () => {
  assert.equal(swellHeightAt({ ...swell, enabled: false }, table, 10, 3, 30, 1), 0);
  assert.equal(swellTotalHeightM({ ...swell, enabled: false }, 1), 0);
  assert.equal(heightAt(10, 3, 0, 1), 0);
  assert.ok(shoalFactor(swell.shoalDepthM, swell.shoalDepthM) === 1);
  const a = shoalFactor(swell.shoalDepthM * 0.25, swell.shoalDepthM);
  const b = shoalFactor(swell.shoalDepthM * 0.75, swell.shoalDepthM);
  assert.ok(a > 0 && a < b && b < 1);
});

await check('the swell moves: the same point has a different height a moment later', () => {
  const a = heightAt(100, 0, 30, 0.5);
  const b = heightAt(100, 1.5, 30, 0.5);
  assert.ok(Math.abs(a - b) > 1e-6, `${a} vs ${b}`);
});

await check(
  'a component fades with distance and the mesh can still resolve it where it ends',
  () => {
    const g = water.waves.mesh.ringGrowth;
    for (const c of swell.components) {
      assert.equal(distanceFade(0, c.wavelengthM, swell), 1);
      assert.equal(distanceFade(swell.fadeToWavelengths * c.wavelengthM, c.wavelengthM, swell), 0);
      // The radial cell is `g` times the distance. Where it passes a third of the wavelength the mesh can no longer
      // draw the wave; by then at least half of it must have faded out.
      const coarseAtM = c.wavelengthM / (3 * g);
      assert.ok(distanceFade(coarseAtM, c.wavelengthM, swell) <= 0.5, `${c.wavelengthM}`);
    }
  },
);

await check('the crests do not fold over (Gerstner loop condition) even in a storm', () => {
  const total = swellMaxHeightM(swell, 1);
  const folding = table.reduce((s, w) => s + w.k * swell.steepness * total * w.amp, 0);
  assert.ok(folding < 1, `${folding}`);
});

await check(
  'the open sea is taller than the coast: 1 x near land, the gain far out, growing with the distance',
  () => {
    const { gain, fromM, toM } = swell.openSea;
    assert.ok(gain > 1 && toM > fromM, 'the open sea is meant to be taller');
    assert.equal(openSeaGrow(swell, 0), 1);
    assert.equal(openSeaGrow(swell, fromM), 1);
    assert.equal(openSeaGrow(swell, toM), gain);
    assert.equal(openSeaGrow(swell, 1e6), gain);
    let last = 1;
    for (let d = 0; d <= toM + 100; d += 5) {
      const g = openSeaGrow(swell, d);
      assert.ok(g >= last - 1e-12 && g <= gain + 1e-12, `${d} ${g}`);
      last = g;
    }
    // near land the waves are the old ones (the user's tuned coast), far out the same point's swell is `gain` x as tall
    const noGain = { ...swell, openSea: { ...swell.openSea, gain: 1 } };
    for (let i = 0; i < 400; i++) {
      const t = i * 0.37;
      assert.equal(
        heightAt(fromM * 0.5, t, 30, 0.5),
        swellHeightAt(noGain, table, fromM * 0.5, t, 30, 0.5),
      );
      const near = swellHeightAt(noGain, table, toM + 50, t, 60, 0.5);
      const far = heightAt(toM + 50, t, 60, 0.5);
      assert.ok(Math.abs(far - near * gain) < 1e-9, `${far} ${near}`);
    }
    // a degenerate range (toM <= fromM) stays finite
    const flat = { ...swell, openSea: { gain, fromM: 200, toM: 200 } };
    assert.ok(Number.isFinite(openSeaGrow(flat, 200)));
  },
);

await check(
  'the swell never moves the waterline: the water over a point stays at least 40 % of its depth',
  () => {
    for (const energy of [0, 0.5, 1]) {
      const height = swellTotalHeightM(swell, energy);
      assert.ok(effectiveShoalDepthM(swell, height) >= 2.5 * height - 1e-9);
      for (let i = 0; i < 6000; i++) {
        const depth = 0.02 + (i % 300) * 0.1;
        const h = heightAt(i * 2.3 - 400, i * 0.41, depth, energy);
        assert.ok(depth + h >= 0.4 * depth - 1e-9, `${depth} ${h} ${energy}`);
      }
    }
  },
);

await check(
  'the swell travels toward the shore: a crest moves to a smaller distance as time passes',
  () => {
    const one = { ...swell, components: [swell.components[0]] };
    const t1 = swellTable(one);
    const wavelength = swell.components[0].wavelengthM;
    const crestAt = (t: number) => {
      let best = -1;
      let at = 0;
      for (let d = 200; d < 200 + wavelength; d += 0.05) {
        const h = swellHeightAt(one, t1, d, t, 60, 0, 0);
        if (h > best) {
          best = h;
          at = d;
        }
      }
      return at;
    };
    const a = crestAt(0);
    const b = crestAt(0.3);
    // modulo one wavelength, the crest at the later time sits at a smaller distance
    const moved = (((a - b) % wavelength) + wavelength) % wavelength;
    assert.ok(moved > 0.05 && moved < wavelength / 2, `${a} -> ${b}`);
  },
);

await check(
  'shore: a front is born at the break line, runs one way and reaches the waterline when the uprush starts',
  () => {
    const d = shoreDerived(shore, 0);
    assert.ok(Math.abs(shoreFrontM(0, d.breakM, shore.riseShare) - d.breakM) < 1e-9);
    assert.ok(Math.abs(shoreFrontM(1 - shore.riseShare, d.breakM, shore.riseShare)) < 1e-9);
    assert.equal(shoreFrontM(1, d.breakM, shore.riseShare), 0);
    let last = Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
      const f = shoreFrontM(p, d.breakM, shore.riseShare);
      assert.ok(f >= 0 && f <= last + 1e-9);
      last = f;
    }
  },
);

await check('shore: the swash pulse stays within 0..1, with no jump at the wrap', () => {
  const { riseShare, backwashShare } = shore;
  assert.ok(
    Math.abs(
      edgePulse(0.999999, riseShare, backwashShare) - edgePulse(0, riseShare, backwashShare),
    ) < 1e-3,
  );
  assert.equal(edgePulse(backwashShare + 0.01, riseShare, backwashShare), 0);
  assert.ok(Math.abs(uprush01(1, riseShare) - 1) < 1e-9);
  assert.equal(uprush01(1 - riseShare, riseShare), 0);
  let maxPulse = 0;
  for (let p = 0; p < 1; p += 0.002) {
    const v = edgePulse(p, riseShare, backwashShare);
    assert.ok(v >= 0 && v <= 1 + 1e-9);
    maxPulse = Math.max(maxPulse, v);
    const w = swashPulse(p, shore);
    assert.ok(w >= v - 1e-9 && w <= 1 + 1e-9);
  }
  assert.ok(maxPulse > 0.99);
});

await check(
  'shore: the swash lifts the sea at the waterline, swings within its bounds, and is gone in deep water and on high ground',
  () => {
    for (const energy of [0, 1]) {
      const d = shoreDerived(shore, energy);
      assert.equal(swashProfile(0, d), 1);
      assert.ok(Math.abs(swashProfile(d.seaW + 0.01, d)) < 1e-12);
      assert.ok(Math.abs(swashProfile(-d.swashH - 0.01, d)) < 1e-12);
      assert.ok(Math.abs(swashProfile(30, d)) < 1e-12);
      let lo = Infinity;
      let hi = -Infinity;
      for (let p = 0; p < 1; p += 0.002) {
        for (const lobe of [0, 1]) {
          const r = runUpM(p, 0, d, shore, lobe);
          lo = Math.min(lo, r);
          hi = Math.max(hi, r);
          assert.ok(Math.abs(runUpM(p, 40, d, shore, lobe)) < 1e-12);
        }
      }
      assert.ok(hi <= d.swashH * (1 - shore.recedeShare) + 1e-9 && hi > 0);
      // it swings (whether it dips below the mean level depends on the tuning: overlapping fronts keep it up)
      assert.ok(lo >= -d.swashH * shore.recedeShare - 1e-9 && lo < hi);
    }
  },
);

await check(
  'shore: the wet sand stays between the damp height and the top of the swash, with no jump at the wrap',
  () => {
    for (const energy of [0, 1]) {
      const d = shoreDerived(shore, energy);
      const peak = Math.max(d.dampH, d.swashH * (1 - shore.recedeShare) * 1.1);
      for (let p = 0; p < 1; p += 0.005) {
        const h = wetHeightM(p, d, shore);
        assert.ok(h >= d.dampH - 1e-9 && h <= peak + 1e-9, `${p} ${h}`);
      }
      assert.ok(Math.abs(wetHeightM(0.99999, d, shore) - wetHeightM(0, d, shore)) < 1e-3);
    }
  },
);

await check('shore: a storm widens the breaker zone and the swash and strengthens the foam', () => {
  const calm = shoreDerived(shore, 0);
  const storm = shoreDerived(shore, 1);
  assert.ok(storm.breakM > calm.breakM && storm.swashH > calm.swashH);
  assert.ok(storm.foamAmount > calm.foamAmount && storm.foamAmount <= 1);
  assert.equal(shoreDerived({ ...shore, enabled: false }, 1).foamAmount, 0);
});

await check(
  'the shore field: distance to the coast, the way to it, and it keeps growing past the map edge',
  () => {
    const radius = 40;
    const field = bakeTestField((x, z) => (Math.hypot(x, z) < radius ? 1 : -1));
    assert.equal(field.size, SHORE_FIELD_SIZE);
    for (const r of [60, 80, 110]) {
      const d = shoreDistanceAt(field, worldSize, r, 0);
      assert.ok(Math.abs(d - (r - radius)) < 1.5, `r=${r} d=${d}`);
    }
    assert.ok(
      shoreDistanceAt(field, worldSize, 0, 0) < -20,
      'inside the island the distance is negative',
    );
    // toward the shore is toward the island
    const n = field.size;
    const texel = (x: number, z: number) => {
      const i = Math.round(((x + worldSize / 2) / worldSize) * (n - 1));
      const j = Math.round(((z + worldSize / 2) / worldSize) * (n - 1));
      return (j * n + i) * 4;
    };
    for (const [x, z] of [
      [80, 0],
      [0, -90],
      [-60, 60],
    ]) {
      const o = texel(x, z);
      const gx = field.data[o + 1];
      const gz = field.data[o + 2];
      const len = Math.hypot(gx, gz);
      assert.ok(len > 0.9 && len < 1.1, `|g|=${len}`);
      const r = Math.hypot(x, z);
      assert.ok(gx * (-x / r) + gz * (-z / r) > 0.98 * len, `${x},${z}`);
    }
    // beyond the edge the distance goes on growing
    assert.ok(
      shoreDistanceAt(field, worldSize, 200, 0) > shoreDistanceAt(field, worldSize, 128, 0) + 60,
    );
    // no land at all: far everywhere
    assert.ok(
      shoreDistanceAt(
        bakeTestField(() => -1),
        worldSize,
        0,
        0,
      ) > 1000,
    );
  },
);

await check(
  'the water disc: rings grow outward, end on the rim, stay within the vertex budget',
  () => {
    const o = { ...water.waves.mesh, radius: 26000 };
    const radii = waterDiscRadii(o);
    assert.equal(radii[0], o.innerM);
    assert.equal(radii[radii.length - 1], o.radius);
    for (let i = 1; i < radii.length; i++) assert.ok(radii[i] > radii[i - 1]);
    const g = createWaterDiscGeometry(o);
    const verts = g.getAttribute('position').count;
    assert.equal(verts, 1 + radii.length * o.segments);
    assert.ok(verts < 60000, `${verts} vertices`);
    // every triangle faces +Z (the mesh is rotated onto the sea, where +Z becomes up)
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const ux = pos.getX(b) - pos.getX(a);
      const uy = pos.getY(b) - pos.getY(a);
      const vx = pos.getX(c) - pos.getX(a);
      const vy = pos.getY(c) - pos.getY(a);
      assert.ok(ux * vy - uy * vx > 0, `triangle ${t / 3} faces down`);
    }
  },
);

await check(
  'enclosed water: a pond the sea cannot reach is a lake, one joined to it by a channel is sea, the land takes the nearest water',
  () => {
    // an island (radius 40) with a closed pond (r 12) at the centre and a pond (r 6) at z = 28 opened to the sea by a 4 m channel
    const field = bakeTestField((x, z) => {
      const closed = Math.hypot(x, z) < 12;
      const open = Math.hypot(x, z - 28) < 6 || (Math.abs(x) < 2 && z > 28);
      return Math.hypot(x, z) < 40 && !closed && !open ? 1 : -1;
    });
    const at = (x: number, z: number) => lakeShareAt(field, worldSize, x, z);
    assert.ok(at(0, 0) > 0.95, `closed pond ${at(0, 0)}`);
    assert.ok(at(100, 0) < 0.05, `open sea ${at(100, 0)}`);
    assert.ok(at(0, 28) < 0.1, `pond joined to the sea ${at(0, 28)}`);
    // land: the shore of the lake reads the lake, the sea's coast reads the sea
    assert.ok(at(14, 0) > 0.9, `lake shore ${at(14, 0)}`);
    assert.ok(at(-38, 0) < 0.1, `sea coast ${at(-38, 0)}`);
    // beyond the map edge it is the edge's value (the sea)
    assert.ok(at(500, 0) < 0.05);
    for (let i = 3; i < field.data.length; i += 4) {
      assert.ok(field.data[i] >= -1e-6 && field.data[i] <= 1 + 1e-6, `share ${field.data[i]}`);
    }
    // no water on the border (a valley map): all of its water is enclosed
    const valley = bakeTestField((x, z) => (x >= -28 && x < 22 && z >= -28 && z < 22 ? -1 : 1));
    assert.ok(lakeShareAt(valley, worldSize, 0, 0) > 0.9);
    // no land at all: the open sea everywhere
    assert.equal(
      lakeShareAt(
        bakeTestField(() => -1),
        worldSize,
        0,
        0,
      ),
      0,
    );
  },
);

await check(
  'enclosed water is calmer: a lower swell, never the other way, and the shares stay in 0..1',
  () => {
    const lake = water.waves.lake;
    for (const share of Object.values(lake)) assert.ok(share >= 0 && share <= 1, `${share}`);
    assert.equal(lakeMul(0, lake.swellShare), 1);
    assert.equal(lakeMul(1, lake.swellShare), lake.swellShare);
    assert.equal(lakeMul(5, lake.swellShare), lake.swellShare);
    assert.equal(lakeMul(-1, lake.swellShare), 1);
    const calm = lakeMul(1, lake.swellShare);
    const cap = swellMaxHeightM(swell, 1) * calm;
    for (let i = 0; i < 2000; i++) {
      const x = i * 3.7 - 500;
      const open = heightAt(x, i * 0.173, 30, 1);
      const lakeH = heightAt(x, i * 0.173, 30, 1, 0, calm);
      assert.ok(Math.abs(lakeH) <= cap + 1e-9, `${lakeH} > ${cap}`);
      assert.ok(Math.abs(lakeH - open * calm) < 1e-9, 'the lake swell is the open one, scaled');
    }
  },
);

finish('all water wave checks passed');
