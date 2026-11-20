// scripts/checks/snow/snow-check.ts — headless checks of the deep snow: the noise port, the bake on synthetic ground, the clipmap
// Run: node --experimental-strip-types scripts/checks/snow/snow-check.ts
import assert from 'node:assert/strict';
import {
  bakeSnow,
  type SnowBakeSource,
  type SnowBakeTune,
  snowWeight,
} from '../../../src/world/snow/cpu/snowBake.ts';
import { brushRects } from '../../../src/world/snow/cpu/snowBrushRects.ts';
import {
  buildClipmapArrays,
  clipmapCovers,
  clipmapExtentM,
  clipmapHoleHalf,
} from '../../../src/world/snow/cpu/snowClipmap.ts';
import {
  setActiveSnowDepth,
  snowDepthAt,
  snowSinkM,
  snowSpeedMultiplier,
} from '../../../src/world/snow/cpu/snowDepth.ts';
import {
  bankDecayTime,
  decayFactor,
  recentreAxis,
  texelEnters,
  windowWorld,
} from '../../../src/world/snow/cpu/snowFieldMath.ts';
import { triNoise3D } from '../../../src/world/snow/cpu/snowNoise.ts';
import { walkStride } from '../../../src/world/snow/cpu/snowStride.ts';
import { check, finish } from '../lib/check.ts';

const HEIGHT_SCALE = 350;
const THICKNESS = 0.8;
// the shipped terrain snow tune (config/visual/terrain.ts)
const TUNE: SnowBakeTune = {
  heightStart: 0.4,
  heightEnd: 0.6,
  mountainWeight: 0.1,
  noise: { amplitude: 0.135, scale: 0.025 },
  aspect: { strength: 0.75, shadeBoost: 0.45 },
};
// 15 degrees above the horizon, the splat's reference sun
const SUN: [number, number, number] = [0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)];
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const slopeRock = (ny: number) => 1 - smooth(0.63, 0.75, ny);

function source(chiselY: (x: number, z: number) => number, size = 256): SnowBakeSource {
  return {
    size,
    texelM: 2048 / size,
    chiselY,
    slopeRock,
    heightScale: HEIGHT_SCALE,
    tune: TUNE,
    sunDir: SUN,
    thicknessM: THICKNESS,
  };
}

await check('triNoise3D matches a hand trace and stays inside its range', () => {
  // hand trace of the four iterations at the origin (derived from three/src/nodes/math/TriNoise3D.js)
  assert.ok(Math.abs(triNoise3D(0, 0, 0) - 0.46763) < 1e-3, `at 0: ${triNoise3D(0, 0, 0)}`);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const v = triNoise3D(i * 0.37 * 0.025, 0, (i * 0.91 + 3) * 0.025);
    assert.ok(v >= 0 && v <= 0.58, `out of range: ${v}`);
    sum += v;
    n++;
  }
  const mean = sum / n;
  assert.ok(mean > 0.2 && mean < 0.4, `mean ${mean}`);
  assert.equal(triNoise3D(1.5, 0, 2.5), triNoise3D(1.5, 0, 2.5));
  // continuous: a 1 cm step moves the value by far less than the whole range
  assert.ok(Math.abs(triNoise3D(1.5, 0, 2.5) - triNoise3D(1.5 + 0.01 * 0.025, 0, 2.5)) < 0.01);
});

await check('snow weight: none well below the line, full well above, less on the sun side', () => {
  const up: [number, number, number] = [0, 1, 0];
  assert.equal(snowWeight(TUNE, 0.1, 10, 10, up, SUN), 0);
  assert.equal(snowWeight(TUNE, 0.9, 10, 10, up, SUN), 1);
  // a slope facing the sun (normal tilted towards +z) holds less than one facing away
  const sunFacing: [number, number, number] = [0, 0.8, 0.6];
  const away: [number, number, number] = [0, 0.8, -0.6];
  let sunSide = 0;
  let shade = 0;
  for (let i = 0; i < 200; i++) {
    sunSide += snowWeight(TUNE, 0.5, i * 13, i * 7, sunFacing, SUN);
    shade += snowWeight(TUNE, 0.5, i * 13, i * 7, away, SUN);
  }
  assert.ok(shade > sunSide, `shade ${shade} vs sun ${sunSide}`);
});

await check(
  'bake on a flat plateau: every texel is exactly the full thickness above the ground',
  () => {
    const bake = bakeSnow(source(() => 300));
    for (let k = 0; k < bake.depth.length; k++) {
      assert.ok(Math.abs(bake.depth[k] - THICKNESS) < 1e-4, `depth ${bake.depth[k]} at ${k}`);
      assert.ok(Math.abs(bake.hull[k] - (300 + THICKNESS)) < 1e-3);
    }
    assert.equal(bake.slope[0], 0);
  },
);

await check('bake: hollows hold more snow than the full thickness, ridges less', () => {
  // a bowl and a bump on a high plateau, both about 10 m wide
  const bumpy = (x: number, z: number) =>
    300 -
    6 * Math.exp(-((x + 400) ** 2 + z ** 2) / 2500) +
    6 * Math.exp(-((x - 400) ** 2 + z ** 2) / 2500);
  const bake = bakeSnow(source(bumpy, 512));
  const at = (x: number, z: number) => {
    const i = Math.floor((x + 1024) / bake.texelM);
    const j = Math.floor((z + 1024) / bake.texelM);
    return bake.depth[j * bake.size + i];
  };
  assert.ok(at(-400, 0) > THICKNESS + 0.05, `bowl ${at(-400, 0)}`);
  assert.ok(at(400, 0) < THICKNESS - 0.05, `bump ${at(400, 0)}`);
  assert.ok(at(0, 600) > THICKNESS - 0.01 && at(0, 600) <= THICKNESS + 0.01, `flat ${at(0, 600)}`);
});

await check(
  'bake on a dome with a cliff: no snow below the line or on the cliff, hull never NaN',
  () => {
    const dome = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      return 315 * Math.max(0, 1 - r / 900) ** 1.2 + 120 * smooth(400, 408, x);
    };
    const bake = bakeSnow(source(dome));
    let snowy = 0;
    for (let j = 0; j < bake.size; j++) {
      for (let i = 0; i < bake.size; i++) {
        const k = j * bake.size + i;
        const x = (i + 0.5) * bake.texelM - 1024;
        const z = (j + 0.5) * bake.texelM - 1024;
        assert.ok(Number.isFinite(bake.hull[k]) && Number.isFinite(bake.slope[2 * k]));
        assert.ok(bake.depth[k] >= 0, `negative depth at ${i},${j}`);
        if (bake.depth[k] > 0) {
          snowy++;
          assert.ok(dome(x, z) / HEIGHT_SCALE + TUNE.noise.amplitude >= TUNE.heightStart - 0.012);
        } else if (dome(x, z) / HEIGHT_SCALE + TUNE.noise.amplitude < TUNE.heightStart - 0.012) {
          assert.equal(
            bake.hull[k],
            Math.fround(dome(x, z)),
            'bare ground keeps its chisel height',
          );
        }
        // the wall at x = 404 rises 120 m over 8 m: steep rock, no snow
        if (Math.abs(x - 404) < 3 && Math.hypot(x, z) < 500) {
          assert.equal(bake.depth[k], 0, `snow on the cliff at ${x},${z}`);
        }
      }
    }
    const share = snowy / bake.depth.length;
    assert.ok(share > 0.002 && share < 0.3, `snow share ${share}`);
  },
);

await check('clipmap: triangle count, indices, and every point near the camera is drawn', () => {
  const spec = { levels: 9, cells: 64, cellM: 0.125 };
  const arrays = buildClipmapArrays(spec);
  const hole = clipmapHoleHalf(spec.cells);
  const ring = spec.cells * spec.cells - (2 * hole) ** 2;
  assert.equal(arrays.triangles, 2 * (spec.cells * spec.cells + (spec.levels - 1) * ring));
  assert.ok(arrays.triangles < 70000, `${arrays.triangles} triangles`);
  const verts = arrays.positions.length / 3;
  assert.equal(arrays.cell.length, verts);
  for (const i of arrays.indices) assert.ok(i < verts);
  assert.equal(clipmapExtentM(spec), 1024);
  // replay the shader's per-level snapping at random camera spots; a point is lost if no level takes it
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let t = 0; t < 400; t++) {
    const camX = (rand() - 0.5) * 2000;
    const camZ = (rand() - 0.5) * 2000;
    for (let s = 0; s < 60; s++) {
      const r = 0.05 * 1000 ** rand(); // 0.05 m to 50 m, ten per decade
      const a = rand() * Math.PI * 2;
      const px = camX + Math.cos(a) * r * 20;
      const pz = camZ + Math.sin(a) * r * 20;
      assert.ok(
        clipmapCovers(spec, camX, camZ, px, pz),
        `uncovered: cam ${camX},${camZ} point ${px},${pz}`,
      );
    }
  }
});

await check('field window: stays within the hysteresis, snaps to the lattice when left', () => {
  assert.equal(recentreAxis(Number.NaN, 13.3, 2, 8), 14);
  assert.equal(recentreAxis(14, 21.9, 2, 8), 14); // 7.9 m off: stays
  assert.equal(recentreAxis(14, 22.1, 2, 8), 22);
  assert.equal(recentreAxis(14, -30.2, 2, 8), -30);
});

await check(
  'field window: moving it clears exactly the strip that entered, no old print survives outside it',
  () => {
    const W = 64;
    const N = 32; // texels, 2 m each
    const texelM = W / N;
    // each texel stores the world coordinate it was stamped at (NaN = empty); t is its world position mod W
    const stored = new Array<number>(N).fill(Number.NaN);
    const t = (i: number) => (i + 0.5) * texelM;
    let centre = 0;
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let orb = 0;
    for (let step = 0; step < 600; step++) {
      orb += (rand() - 0.45) * 5; // a drifting walk, now and then a fast leg
      if (step % 150 === 149) orb += 400; // and a teleport
      // stamp around the orb (as the system does after recentring)
      const next = recentreAxis(centre, orb, 2, 8);
      let entering = 0;
      for (let i = 0; i < N; i++) {
        if (texelEnters(t(i), centre, next, W)) {
          stored[i] = Number.NaN;
          entering++;
        }
      }
      const shift = Math.abs(next - centre);
      assert.equal(entering, shift >= W ? N : Math.round(shift / texelM), `strip at step ${step}`);
      centre = next;
      for (let i = 0; i < N; i++) {
        const world = windowWorld(t(i), centre, W);
        if (Math.abs(world - orb) < 6) stored[i] = world;
        // an old print is only ever shown where it was stamped: inside the window, at its own world point
        if (!Number.isNaN(stored[i])) {
          assert.equal(stored[i], world, `ghost at texel ${i}, step ${step}`);
          assert.ok(world >= centre - W / 2 && world < centre + W / 2);
        }
      }
    }
  },
);

await check(
  'refill: banked time makes the same fade as the continuous one; half-float needs the bank',
  () => {
    const tau = 600;
    // 60 s at 60 fps: banked into one-second passes
    let bank = 0;
    let kept = 1;
    let applied = 0;
    for (let f = 0; f < 3600; f++) {
      const taken = bankDecayTime(bank, 1 / 60, 1);
      bank = taken.bank;
      if (taken.apply > 0) {
        kept *= decayFactor(taken.apply, tau);
        applied += taken.apply;
      }
    }
    assert.ok(Math.abs(applied + bank - 60) < 1e-6);
    assert.ok(Math.abs(kept - decayFactor(applied, tau)) < 1e-12);
    assert.equal(decayFactor(0, 0), 1);
    assert.equal(decayFactor(5, 0), 0);
    // the trap the bank avoids: a furrow of 0.35 m stored as a half-float and faded every frame does not move at all
    let perFrame = Math.f16round(0.35);
    let banked = Math.f16round(0.35);
    for (let f = 0; f < 3600; f++) perFrame = Math.f16round(perFrame * decayFactor(1 / 60, tau));
    for (let s = 0; s < 60; s++) banked = Math.f16round(banked * decayFactor(1, tau));
    assert.equal(perFrame, Math.f16round(0.35), 'the per-frame fade is lost to rounding');
    assert.ok(banked < 0.34, `banked fade works: ${banked}`);
  },
);

await check(
  'snow depth under a point: bilinear over texel centres, 0 with no snow, clamped at the edge',
  () => {
    assert.equal(snowDepthAt(10, 10), 0);
    const size = 4;
    const texelM = 8; // world 32 m, centres at -12, -4, 4, 12
    const depth = new Float32Array(size * size);
    depth[1 * size + 1] = 0.8; // centre (-4, -4)
    depth[1 * size + 2] = 0.4; // centre (4, -4)
    setActiveSnowDepth({ size, texelM, depth });
    assert.ok(Math.abs(snowDepthAt(-4, -4) - 0.8) < 1e-6);
    assert.ok(Math.abs(snowDepthAt(0, -4) - 0.6) < 1e-6, 'midway between two texels');
    assert.ok(Math.abs(snowDepthAt(-4, 0) - 0.4) < 1e-6, 'midway down to a bare texel');
    assert.ok(
      Math.abs(snowDepthAt(-1000, -1000)) < 1e-6 && Math.abs(snowDepthAt(1000, 1000)) < 1e-6,
    );
    assert.ok(Math.abs(snowDepthAt(-4 + 1e-3, -4) - 0.8) < 1e-2);
    setActiveSnowDepth(null);
    assert.equal(snowDepthAt(-4, -4), 0);
  },
);

await check(
  'orb in deep snow: full speed on bare ground, slowest once deep, sinks by a share up to a cap',
  () => {
    assert.equal(snowSpeedMultiplier(0, 0.45, 0.8), 1);
    assert.ok(Math.abs(snowSpeedMultiplier(0.8, 0.45, 0.8) - 0.45) < 1e-9);
    assert.ok(Math.abs(snowSpeedMultiplier(3, 0.45, 0.8) - 0.45) < 1e-9);
    let prev = 1;
    for (let d = 0; d <= 0.8; d += 0.02) {
      const m = snowSpeedMultiplier(d, 0.45, 0.8);
      assert.ok(m <= prev + 1e-12, `speed rises at ${d}`);
      prev = m;
    }
    assert.equal(snowSinkM(0, 0.5, 1), 0);
    assert.ok(Math.abs(snowSinkM(0.8, 0.5, 1) - 0.4) < 1e-9);
    assert.ok(Math.abs(snowSinkM(5, 0.5, 1) - 0.5) < 1e-9, 'capped');
    assert.equal(snowSinkM(-1, 0.5, 1), 0);
  },
);

await check(
  'footprint stride: even spacing at any frame rate, no gaps, a jump is one print',
  () => {
    const stride = 0.25;
    for (const frameM of [0.02, 0.13, 0.25, 0.7, 2.9]) {
      const last = { x: Number.NaN, z: 0 };
      const prints: [number, number][] = [];
      const emit = (x: number, z: number) => prints.push([x, z]);
      walkStride(last, { x: 0, z: 0 }, stride, 24, emit);
      let x = 0;
      let z = 0;
      for (let f = 0; f < 400; f++) {
        x += frameM * 0.8;
        z += frameM * 0.6;
        walkStride(last, { x, z }, stride, 24, emit);
      }
      const total = 400 * frameM;
      assert.ok(
        Math.abs(prints.length - Math.floor(total / stride)) <= 1,
        `${frameM}: ${prints.length}`,
      );
      for (let i = 1; i < prints.length; i++) {
        const gap = Math.hypot(prints[i][0] - prints[i - 1][0], prints[i][1] - prints[i - 1][1]);
        assert.ok(Math.abs(gap - stride) < 1e-9, `gap ${gap} at ${i} (${frameM} m a frame)`);
      }
    }
    const last = { x: 0, z: 0 };
    const jump: [number, number][] = [];
    walkStride(last, { x: 300, z: 0 }, stride, 24, (x, z) => jump.push([x, z]));
    assert.deepEqual(jump, [[300, 0]]);
    assert.deepEqual(last, { x: 300, z: 0 });
  },
);

await check(
  'brush rects: cover the brush, wrap across the window edge, stay inside the target',
  () => {
    const windowM = 64;
    const res = 1024;
    const texelM = windowM / res;
    const reachM = 0.63;
    // the pixel (top row counted down, uv.y = row / res) a world point lands on
    const px = (w: number) => Math.floor((w / windowM - Math.floor(w / windowM)) * res);
    const py = px;
    const inRects = (rects: readonly (readonly number[])[], x: number, y: number) =>
      rects.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
    // centres in the middle, on the seam, at the far corner, and in negative space
    for (const [x, z] of [
      [10.3, -7.7],
      [0.01, 31.99],
      [63.99, 63.99],
      [-0.02, -64.3],
      [-123.4, 200.6],
    ]) {
      const rects = brushRects(x, z, reachM, windowM, res);
      assert.ok(rects.length >= 1 && rects.length <= 4, `${x},${z}: ${rects.length} rects`);
      for (const [rx, ry, rw, rh] of rects) {
        assert.ok(
          rx >= 0 && ry >= 0 && rx + rw <= res && ry + rh <= res && rw > 0 && rh > 0,
          `${x},${z}: out of the target ${rx},${ry},${rw},${rh}`,
        );
      }
      // every texel within reach of the brush is inside a rect
      for (let dx = -reachM; dx <= reachM; dx += texelM) {
        for (let dz = -reachM; dz <= reachM; dz += texelM) {
          if (Math.hypot(dx, dz) > reachM) continue;
          assert.ok(inRects(rects, px(x + dx), py(z + dz)), `${x},${z}: missed ${dx},${dz}`);
        }
      }
      // and the rects are not the whole window
      const area = rects.reduce((s, r) => s + r[2] * r[3], 0);
      assert.ok(area < 0.01 * res * res, `${x},${z}: ${area} px`);
    }
    // a brush wider than the window is the whole target, once
    assert.deepEqual(brushRects(5, 5, 40, windowM, res), [[0, 0, res, res]]);
  },
);

finish('all snow checks passed');
