// scripts/checks/overview/overview-check.ts — headless checks of the overview camera's rules and of what a click picks.
import assert from 'node:assert/strict';
import { PHASE0 } from '../../../src/config/phase0.ts';
import { insideFootprint } from '../../../src/core/math/geom.ts';
import { describe, describeWorldOf } from '../../../src/overview/overviewDescribe.ts';
import {
  canEnterOverview,
  clampDistance,
  clampFocus,
  grabShift,
  orbitPose,
  panStep,
  pitchRad,
  rayGroundHit,
  rayPlaneHit,
} from '../../../src/overview/overviewMath.ts';
import { pickTarget, rayBuildingHit, sameSelection } from '../../../src/overview/overviewPick.ts';
import { neutralModifiers, setModifiers } from '../../../src/skills/modifiers.ts';
import type { Building } from '../../../src/world/village/model/types.ts';
import {
  chopMul,
  fieldBonus,
  shrineFaith,
} from '../../../src/world/village/sim/buildingEffects.ts';
import { check, finish } from '../lib/check.ts';
import { buildingOf, loadMap, makeSim } from '../lib/villageHeadless.ts';

const O = PHASE0.OVERVIEW;
const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

await check('the camera sits behind the focus at the given distance and looks at it', () => {
  const focus = { x: 10, y: 3, z: -4 };
  for (const yaw of [0, Math.PI / 2, 2.3]) {
    const p = orbitPose(focus, yaw, pitchRad(), 100);
    assert.deepEqual(p.look, focus);
    near(Math.hypot(p.position.x - 10, p.position.y - 3, p.position.z + 4), 100);
  }
  const p = orbitPose(focus, 0, pitchRad(), 100);
  near(p.position.x, 10);
  assert.ok(p.position.z > -4 && p.position.y > 3, 'yaw 0: behind (+z) and above');
});

await check('the distance stays within its limits and the focus within the village rim', () => {
  near(clampDistance(1), O.DISTANCE_MIN_M);
  near(clampDistance(1e6), O.DISTANCE_MAX_M);
  const mid = (O.DISTANCE_MIN_M + O.DISTANCE_MAX_M) / 2;
  near(clampDistance(mid), mid);
  const village = { x: 100, z: -50, radiusM: 160 };
  assert.deepEqual(clampFocus(120, -40, village), { x: 120, z: -40 });
  const out = clampFocus(100 + 1000, -50, village);
  near(out.x, 100 + 160 + O.MARGIN_M);
  near(out.z, -50);
  const d = clampFocus(100, -50 - 5000, village);
  near(Math.hypot(d.x - 100, d.z + 50), 160 + O.MARGIN_M);
});

await check('panning follows the view, grows with distance and does nothing without input', () => {
  const w0 = panStep({ x: 0, y: -1 }, 0, 100, 1);
  near(w0.x, 0);
  assert.ok(w0.z < 0, 'W at yaw 0 looks along -z');
  const d0 = panStep({ x: 1, y: 0 }, 0, 100, 1);
  assert.ok(d0.x > 0, 'D moves to the right');
  near(d0.z, 0);
  const turned = panStep({ x: 0, y: -1 }, Math.PI / 2, 100, 1);
  assert.ok(turned.x < 0, 'yaw 90 degrees looks along -x');
  near(turned.z, 0, 1e-9);
  const far = panStep({ x: 0, y: -1 }, 0, 200, 1);
  assert.ok(Math.hypot(far.x, far.z) > Math.hypot(w0.x, w0.z));
  assert.deepEqual(panStep({ x: 0, y: 0 }, 0.3, 100, 1), { x: 0, z: 0 });
});

await check('the ray finds the ground, flat or sloped, and nothing out of reach', () => {
  const flat = () => 2;
  const dirDown = { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  const hit = rayGroundHit({ x: 0, y: 52, z: 0 }, dirDown, flat, 500);
  assert.ok(hit);
  near(hit.y, 2);
  near(hit.z, -50, 0.01);
  assert.equal(rayGroundHit({ x: 0, y: 52, z: 0 }, { x: 0, y: 1, z: 0 }, flat, 500), null, 'up');
  assert.equal(rayGroundHit({ x: 0, y: 52, z: 0 }, dirDown, flat, 10), null, 'out of reach');
  assert.equal(rayGroundHit({ x: 0, y: 1, z: 0 }, dirDown, flat, 500), null, 'already under');
  const slope = (_x: number, z: number) => -z * 0.2;
  const s = rayGroundHit({ x: 0, y: 40, z: 0 }, dirDown, slope, 500);
  assert.ok(s);
  near(s.y, slope(s.x, s.z));
  near(s.y - 40, s.z, 0.01); // on the ray
});

await check('the ray hits a plane in front of it only', () => {
  assert.deepEqual(rayPlaneHit({ x: 1, y: 10, z: 1 }, { x: 0, y: -1, z: 0 }, 4), {
    x: 1,
    y: 4,
    z: 1,
  });
  assert.equal(rayPlaneHit({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 4), null, 'parallel');
  assert.equal(rayPlaneHit({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, 4), null, 'behind');
});

await check('a ground grab moves the focus by (grabbed - now)', () => {
  assert.deepEqual(grabShift({ x: 5, y: 0, z: 5 }, { x: 8, y: 0, z: 3 }), { x: -3, z: 2 });
});

await check('the overview opens only for a converted village within reach of the temple', () => {
  const radius = 6;
  const reach = radius + O.REACH_M;
  const can = (o: { converted?: boolean; dist: number | null }) =>
    canEnterOverview({
      converted: o.converted ?? true,
      templeDistanceM: o.dist,
      templeRadiusM: radius,
    });
  assert.equal(can({ dist: reach }), true);
  assert.equal(can({ dist: reach + 0.1 }), false);
  assert.equal(can({ converted: false, dist: 1 }), false);
  assert.equal(can({ dist: null }), false);
});

const map = loadMap('island-mountain');
const hamlet = makeSim(map, { mode: 'hamlet' });
const flat = () => 0;
const down = (x: number, z: number) => ({ ox: x, oy: 50, oz: z, dx: 0, dy: -1, dz: 0 });
const farProject = () => ({ x: -9999, y: -9999 });

await check('a ray hits the box of the building under it, turned as the village turns it', () => {
  const house = hamlet.buildings.find((b) => b.type.startsWith('house_'))!;
  assert.ok(
    rayBuildingHit(down(house.x, house.z), house, 0) !== null,
    'straight down onto a house',
  );
  const away = house.halfW + house.halfD + 5;
  assert.equal(rayBuildingHit(down(house.x + away, house.z), house, 0), null);
  // A slanted ray aimed at the middle of the house finds its box.
  const aim = { x: 0, y: -10, z: -20 };
  const len = Math.hypot(aim.x, aim.y, aim.z);
  const slanted = {
    ox: house.x,
    oy: 12,
    oz: house.z + 20,
    dx: aim.x / len,
    dy: aim.y / len,
    dz: aim.z / len,
  };
  const t = rayBuildingHit(slanted, house, 0);
  assert.ok(t !== null && t > 0, 'a slanted ray finds the box');
  // local +x maps to world (cos, -sin) = (0, -1) at rotY = 90 degrees
  const turned = { ...house, rotY: Math.PI / 2, x: 0, z: 0, halfW: 4, halfD: 1 };
  assert.ok(rayBuildingHit(down(0, -3.9), turned, 0) !== null, 'local x runs along world -z');
  assert.equal(rayBuildingHit(down(3.9, 0), turned, 0, 0), null, 'and not along world x');
});

await check('a click picks a villager before a building before a field, else nothing', () => {
  const v = hamlet.villagers;
  const project = (x: number, _y: number, z: number) => ({ x: x * 10, y: z * 10 }); // top-down, 10 px/m
  const world = { buildings: hamlet.buildings, fields: hamlet.fields, villagers: v };
  const noOne = { ...v, count: 0 };

  let outdoors = -1;
  for (let i = 0; i < v.count; i++) if (!v.indoors[i]) outdoors = i;
  assert.ok(outdoors >= 0, 'the hamlet has a villager outdoors');
  const mouse = { x: v.x[outdoors]! * 10 + 5, y: v.z[outdoors]! * 10 };
  const sel = pickTarget({
    mouse,
    ray: down(v.x[outdoors]!, v.z[outdoors]!),
    ground: { x: v.x[outdoors]!, z: v.z[outdoors]! },
    world,
    groundY: flat,
    project,
  });
  let nearest = -1;
  let nearestPx = Number.POSITIVE_INFINITY;
  for (let i = 0; i < v.count; i++) {
    if (v.indoors[i]) continue;
    const px = Math.hypot(v.x[i]! * 10 - mouse.x, v.z[i]! * 10 - mouse.y);
    if (px < nearestPx) {
      nearestPx = px;
      nearest = i;
    }
  }
  assert.deepEqual(sel, { kind: 'villager', index: nearest }, 'the nearest villager wins');

  const temple = hamlet.buildings.find((b) => b.type === 'temple')!;
  assert.deepEqual(
    pickTarget({
      mouse: { x: 0, y: 0 },
      ray: down(temple.x, temple.z),
      ground: { x: temple.x, z: temple.z },
      world: { ...world, villagers: noOne },
      groundY: flat,
      project: farProject,
    }),
    { kind: 'building', id: temple.id },
  );

  const field = hamlet.fields[0]!;
  assert.ok(insideFootprint(field, field.x, field.z));
  assert.deepEqual(
    pickTarget({
      mouse: { x: 0, y: 0 },
      ray: null,
      ground: { x: field.x, z: field.z },
      world: { ...world, buildings: [], villagers: noOne },
      groundY: flat,
      project: farProject,
    }),
    { kind: 'field', id: field.id },
  );

  assert.equal(
    pickTarget({
      mouse: { x: 0, y: 0 },
      ray: down(temple.x + 500, temple.z + 500),
      ground: { x: temple.x + 500, z: temple.z + 500 },
      world: { ...world, villagers: noOne },
      groundY: flat,
      project: farProject,
    }),
    null,
    'empty ground',
  );

  const indoors = new Uint8Array(v.count).fill(1);
  assert.equal(
    pickTarget({
      mouse: { x: v.x[0]! * 10, y: v.z[0]! * 10 },
      ray: null,
      ground: null,
      world: { ...world, buildings: [], fields: [], villagers: { ...v, indoors } },
      groundY: flat,
      project,
    }),
    null,
    'villagers indoors are not pickable',
  );
});

await check('two selections are the same only when kind and target match', () => {
  assert.ok(sameSelection({ kind: 'building', id: 3 }, { kind: 'building', id: 3 }));
  assert.ok(!sameSelection({ kind: 'building', id: 3 }, { kind: 'field', id: 3 }));
  assert.ok(!sameSelection({ kind: 'villager', index: 1 }, { kind: 'villager', index: 2 }));
  assert.ok(sameSelection(null, null));
});

// --- the panel of a building says what the sim does ---

/** The panel of `b`, standing in the hamlet (with the buildings it brings). */
function panelOf(b: Building) {
  const world = describeWorldOf(hamlet);
  const panel = describe(
    { kind: 'building', id: b.id },
    { ...world, buildings: [b, ...world.buildings] },
  );
  assert.ok(panel, 'the building has a panel');
  return (label: string) => panel.rows.find((r) => r.label === label)?.value;
}

await check('a farmstead panel gives what one field feels, as the sim counts it', () => {
  const field = hamlet.fields[0]!;
  const bonusOf = (f: { x: number; z: number }, farm: Building) =>
    fieldBonus(f, [farm], { growthMul: 1, yieldAdd: 0 });
  for (const level of [1, 3]) {
    const farm = buildingOf('farmstead', { id: 9001, x: field.x + 12, z: field.z, level });
    const row = panelOf(farm);
    const felt = bonusOf(field, farm);
    assert.equal(row('Growth, each field'), `${Math.round((felt.growthMul - 1) * 100)}% faster`);
    assert.equal(row('Harvest, each field'), `${felt.yieldAdd} more food`);
    const inReach = hamlet.fields.filter((f) => bonusOf(f, farm).yieldAdd > 0).length;
    assert.equal(row('Fields in reach'), String(inReach));
  }
});

await check(
  'a workshop panel says how much faster its level makes the axes, and is silent at level 1',
  () => {
    assert.equal(panelOf(buildingOf('workshop', { id: 9002, level: 1 }))('Woodcutters'), undefined);
    const at = (level: number) => {
      const shop = buildingOf('workshop', { id: 9002, level });
      return panelOf(shop)('Woodcutters') === `${Math.round((chopMul([shop]) - 1) * 100)}% faster`;
    };
    assert.ok(at(2) && at(3));
  },
);

await check(
  'a shrine panel gives its own faith a minute, with the faith factor of the skills',
  () => {
    const shrine = buildingOf('shrine', { id: 9003, level: 2 });
    const perMinute = (factor: number) => {
      setModifiers({ ...neutralModifiers(), faithMul: factor });
      try {
        return panelOf(shrine)('Faith from this');
      } finally {
        setModifiers(neutralModifiers());
      }
    };
    assert.equal(perMinute(1), `${(shrineFaith([shrine]) * 60).toFixed(1)} a minute`);
    assert.equal(perMinute(1.5), `${(shrineFaith([shrine]) * 1.5 * 60).toFixed(1)} a minute`);
  },
);

finish('all overview checks passed');
