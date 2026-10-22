// scripts/checks/village/coarse-route-check.ts — the long walk to a place far outside the village grid
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { VILLAGE } from '../../../src/config/village.ts';
import { findCoarseRoute } from '../../../src/world/village/sim/coarseRoute.ts';
import { check, finish } from '../lib/check.ts';
import { loadMap } from '../lib/villageHeadless.ts';

const map = loadMap('island-mountain');
const { sampler, seed } = map;
const LIMIT = VILLAGE.RESTORATION.ROUTE_WALK_LIMIT_MIN;
const WALK = VILLAGE.VILLAGERS.WALK_SPEED_MPS;

/** Targets on rings around the village: some are land, some water or cut off. */
const targets: { x: number; z: number; r: number }[] = [];
for (const r of [250, 450, 650]) {
  for (let b = 0; b < 12; b++) {
    const a = (b / 12) * Math.PI * 2;
    targets.push({ x: seed.x + Math.sin(a) * r, z: seed.z + Math.cos(a) * r, r });
  }
}
const routes = targets.map((t) => ({
  t,
  route: findCoarseRoute(sampler, seed.x, seed.z, t.x, t.z),
}));
const found = routes.filter((r) => r.route !== null);

await check('some places can be reached on foot and some cannot', () => {
  assert.ok(found.length >= 10, `only ${found.length} of ${targets.length} reachable`);
  assert.ok(found.length < targets.length, 'water and ridges cut some off');
});

await check(
  'a route starts at the village, ends near the place, and is within the walking limit',
  () => {
    for (const { t, route } of found) {
      const pts = route!.points;
      assert.equal(pts.length % 2, 0);
      assert.ok(pts.length >= 4, 'at least a start and an end');
      assert.equal(pts[0], Math.fround(seed.x));
      assert.equal(pts[1], Math.fround(seed.z));
      assert.equal(pts[pts.length - 2], Math.fround(route!.endX));
      assert.equal(pts[pts.length - 1], Math.fround(route!.endZ));
      assert.ok(
        Math.hypot(route!.endX - t.x, route!.endZ - t.z) <= 24 * Math.SQRT2 + 1,
        'ends near the place',
      );
      assert.ok(route!.walkMinutes <= LIMIT, `${route!.walkMinutes} min`);
      assert.ok(route!.effortM / WALK / 60 === route!.walkMinutes);
      assert.ok(
        route!.effortM >= Math.hypot(route!.endX - seed.x, route!.endZ - seed.z) - 12,
        'the walk is not shorter than the straight line',
      );
    }
  },
);

await check('a route stays on dry ground between its waypoints', () => {
  for (const { route } of found) {
    const p = route!.points;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const [ax, az, bx, bz] = [p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps;
        const z = az + ((bz - az) * s) / steps;
        assert.ok(!sampler.isWet(x, z), `wet at ${x.toFixed(0)}, ${z.toFixed(0)}`);
      }
    }
  }
});

await check('the same question gives the same route', () => {
  const { t, route } = found[found.length - 1]!;
  const again = findCoarseRoute(sampler, seed.x, seed.z, t.x, t.z)!;
  assert.deepEqual(Array.from(again.points), Array.from(route!.points));
  assert.equal(again.effortM, route!.effortM);
});

await check('a shorter limit refuses a far place, and a place in the sea has no route', () => {
  const far = found.reduce((a, b) => (b.route!.walkMinutes > a.route!.walkMinutes ? b : a));
  assert.equal(
    findCoarseRoute(sampler, seed.x, seed.z, far.t.x, far.t.z, far.route!.walkMinutes / 2),
    null,
  );
  // Far out at sea: no land within reach of the place.
  assert.equal(findCoarseRoute(sampler, seed.x, seed.z, seed.x + 5000, seed.z, 600), null);
});

await check('every landmark of a shipped map with a village can be reached from it', () => {
  const dir = new URL('../../../public/maps/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    const json = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const landmarks = json.entities.filter((e: { type: string }) => e.type === 'landmark');
    if (
      landmarks.length === 0 ||
      !json.entities.some((e: { type: string }) => e.type === 'villageSeed')
    ) {
      continue;
    }
    const m = loadMap(file.replace(/\.json$/, ''));
    for (const l of landmarks) {
      const route = findCoarseRoute(m.sampler, m.seed.x, m.seed.z, l.x, l.z);
      assert.ok(route, `${file}: the ${l.kind} cannot be reached within ${LIMIT} minutes`);
    }
  }
});

finish('all coarse route checks passed');
