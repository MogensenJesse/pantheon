// scripts/overview/overview-check.ts — headless checks of the overview camera's maths (pose, clamps,
// panning, the ray against the ground, the ground grab, when it may start).
//
//   node --experimental-strip-types scripts/overview/overview-check.ts
import assert from 'node:assert/strict';
import { PHASE0 } from '../../src/config/phase0.ts';
import {
  activityText,
  bedSummary,
  buildProgress,
  describe,
  nameOf,
  residentsPerBuilding,
} from '../../src/overview/overviewDescribe.ts';
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
  smoothstep,
} from '../../src/overview/overviewMath.ts';
import {
  buildingHeightM,
  insideField,
  pickTarget,
  rayBuildingHit,
  sameSelection,
} from '../../src/overview/overviewPick.ts';
import { bedsOf } from '../../src/world/village/model/buildings.ts';
import { loadMap, makeSim, simulate } from '../lib/villageHeadless.ts';

const O = PHASE0.OVERVIEW;
const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

// smoothstep: clamped, 0 and 1 at the ends, 0.5 in the middle.
near(smoothstep(-1), 0);
near(smoothstep(2), 1);
near(smoothstep(0.5), 0.5);

// orbitPose: yaw 0 puts the camera behind (+z) and above; the look point is the focus.
{
  const focus = { x: 10, y: 3, z: -4 };
  const p = orbitPose(focus, 0, pitchRad(), 100);
  near(p.position.x, 10);
  near(p.position.z, -4 + 100 * Math.cos(pitchRad()));
  near(p.position.y, 3 + 100 * Math.sin(pitchRad()));
  assert.deepEqual(p.look, focus);
  const q = orbitPose(focus, Math.PI / 2, pitchRad(), 100);
  near(q.position.x, 10 + 100 * Math.cos(pitchRad()));
  near(q.position.z, -4, 1e-9);
  // the camera is always `distance` away from the focus
  const d = Math.hypot(q.position.x - 10, q.position.y - 3, q.position.z + 4);
  near(d, 100);
}

// clampDistance
near(clampDistance(1), O.DISTANCE_MIN_M);
near(clampDistance(1e6), O.DISTANCE_MAX_M);
near(clampDistance(50), 50);

// clampFocus: inside stays, outside lands on the rim (village radius + margin).
{
  const village = { x: 100, z: -50, radiusM: 160 };
  assert.deepEqual(clampFocus(120, -40, village), { x: 120, z: -40 });
  const c = clampFocus(100 + 1000, -50, village);
  near(c.x, 100 + 160 + O.MARGIN_M);
  near(c.z, -50);
  const d = clampFocus(100, -50 - 5000, village);
  near(Math.hypot(d.x - 100, d.z + 50), 160 + O.MARGIN_M);
}

// panStep: W (dir.y = -1) moves where the camera looks; D moves to its right; speed grows with distance.
{
  const w0 = panStep({ x: 0, y: -1 }, 0, 100, 1);
  near(w0.x, 0);
  near(w0.z, -O.PAN_PER_DISTANCE * 100); // yaw 0 looks along -z
  const d0 = panStep({ x: 1, y: 0 }, 0, 100, 1);
  near(d0.x, O.PAN_PER_DISTANCE * 100);
  near(d0.z, 0);
  const wTurned = panStep({ x: 0, y: -1 }, Math.PI / 2, 100, 1);
  near(wTurned.x, -O.PAN_PER_DISTANCE * 100); // yaw 90° looks along -x
  near(wTurned.z, 0, 1e-9);
  assert.ok(
    Math.hypot(panStep({ x: 0, y: -1 }, 0, 200, 1).x, panStep({ x: 0, y: -1 }, 0, 200, 1).z) >
      Math.hypot(w0.x, w0.z),
  );
  assert.deepEqual(panStep({ x: 0, y: 0 }, 0.3, 100, 1), { x: 0, z: 0 });
}

// rayGroundHit: flat ground at y = 2, and a slope.
{
  const flat = () => 2;
  const dirDown = { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  const hit = rayGroundHit({ x: 0, y: 52, z: 0 }, dirDown, flat, 500);
  assert.ok(hit);
  near(hit.y, 2);
  near(hit.z, -50, 0.01);
  assert.equal(rayGroundHit({ x: 0, y: 52, z: 0 }, { x: 0, y: 1, z: 0 }, flat, 500), null); // up
  assert.equal(rayGroundHit({ x: 0, y: 52, z: 0 }, dirDown, flat, 10), null); // out of reach
  assert.equal(rayGroundHit({ x: 0, y: 1, z: 0 }, dirDown, flat, 500), null); // already under
  const slope = (_x: number, z: number) => -z * 0.2; // rises towards -z
  const s = rayGroundHit({ x: 0, y: 40, z: 0 }, dirDown, slope, 500);
  assert.ok(s);
  near(s.y, slope(s.x, s.z), 1e-6);
  // the point is on the ray: x = 0, and y - 40 = z (45 degrees)
  near(s.y - 40, s.z, 0.01);
}

// rayPlaneHit
{
  const hit = rayPlaneHit({ x: 1, y: 10, z: 1 }, { x: 0, y: -1, z: 0 }, 4);
  assert.deepEqual(hit, { x: 1, y: 4, z: 1 });
  assert.equal(rayPlaneHit({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 }, 4), null);
  assert.equal(rayPlaneHit({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, 4), null);
}

// grabShift: pressing on a point and dragging so that another point is under the mouse moves the
// focus by (grabbed - now); the grabbed point is then back under the mouse.
assert.deepEqual(grabShift({ x: 5, y: 0, z: 5 }, { x: 8, y: 0, z: 3 }), { x: -3, z: 2 });

// canEnterOverview
const reach = 6 + O.REACH_M;
assert.equal(canEnterOverview({ converted: true, templeDistanceM: reach, templeRadiusM: 6 }), true);
assert.equal(
  canEnterOverview({ converted: true, templeDistanceM: reach + 0.1, templeRadiusM: 6 }),
  false,
);
assert.equal(canEnterOverview({ converted: false, templeDistanceM: 1, templeRadiusM: 6 }), false);
assert.equal(canEnterOverview({ converted: true, templeDistanceM: null, templeRadiusM: 6 }), false);

// --- M3b: picking and what the panel says ---

const extraOf = (sim: ReturnType<typeof makeSim>) => ({
  stock: stockOf(sim),
  graves: sim.graves.length,
  hunger: 'fed' as const,
});
const stockOf = (sim: ReturnType<typeof makeSim>) => {
  const caps = sim.economy.caps();
  return {
    wood: sim.economy.stock.wood,
    food: sim.economy.stock.food,
    woodCap: caps.wood,
    foodCap: caps.food,
  };
};

const map = loadMap('island-mountain');
const hamlet = makeSim(map, { mode: 'hamlet' });
const flat = () => 0;
const down = (x: number, z: number) => ({ ox: x, oy: 50, oz: z, dx: 0, dy: -1, dz: 0 });
const farProject = () => ({ x: -9999, y: -9999 });

// A ray from above hits the box of the building under it, and not one a few metres away.
{
  const house = hamlet.buildings.find((b) => b.type.startsWith('house_'))!;
  assert.ok(
    rayBuildingHit(down(house.x, house.z), house, 0) !== null,
    'straight down onto a house',
  );
  const away = house.halfW + house.halfD + 5;
  assert.equal(rayBuildingHit(down(house.x + away, house.z), house, 0), null);
  // A slanted ray aimed at the middle of the house finds its box (and would reach the ground behind it).
  const aim = { x: 0, y: -10, z: -20 };
  const len = Math.hypot(aim.x, aim.y, aim.z);
  const unit = {
    ox: house.x,
    oy: 12,
    oz: house.z + 20,
    dx: aim.x / len,
    dy: aim.y / len,
    dz: aim.z / len,
  };
  const t = rayBuildingHit(unit, house, 0);
  assert.ok(t !== null && t > 0, 'a slanted ray finds the box');
  // A footprint turned by rotY is turned as the village turns its frames: the point at local (halfW - 0.1, 0) is inside.
  const turned = { ...house, rotY: Math.PI / 2, x: 0, z: 0, halfW: 4, halfD: 1 };
  // local +x maps to world (cos, -sin) = (0, -1) at rotY = 90 degrees
  assert.ok(
    rayBuildingHit(down(0, -3.9), turned, 0) !== null,
    'local x runs along world -z at 90 degrees',
  );
  assert.equal(rayBuildingHit(down(3.9, 0), turned, 0, 0), null, 'and not along world x');
  assert.ok(buildingHeightM('temple', 2) > buildingHeightM('house_a', 2));
  assert.ok(buildingHeightM('house_a', 0) < buildingHeightM('house_a', 1));
}

// pickTarget: villager beats building beats field; empty ground is null.
{
  const v = hamlet.villagers;
  // A top-down "screen": 10 px per metre.
  const project = (x: number, _y: number, z: number) => ({ x: x * 10, y: z * 10 });
  let outdoors = -1;
  for (let i = 0; i < v.count; i++) if (!v.indoors[i]) outdoors = i;
  const world = { buildings: hamlet.buildings, fields: hamlet.fields, villagers: v };
  if (outdoors >= 0) {
    const mouse = { x: v.x[outdoors]! * 10 + 5, y: v.z[outdoors]! * 10 };
    const sel = pickTarget({
      mouse,
      ray: down(v.x[outdoors]!, v.z[outdoors]!),
      ground: { x: v.x[outdoors]!, z: v.z[outdoors]! },
      world,
      groundY: flat,
      project,
    });
    // The nearest outdoors villager to the mouse, by brute force.
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
  }
  const temple = hamlet.buildings.find((b) => b.type === 'temple')!;
  const farFromEveryone = pickTarget({
    mouse: { x: 0, y: 0 },
    ray: down(temple.x, temple.z),
    ground: { x: temple.x, z: temple.z },
    world: { ...world, villagers: { ...v, count: 0 } },
    groundY: flat,
    project: farProject,
  });
  assert.deepEqual(farFromEveryone, { kind: 'building', id: temple.id });
  const field = hamlet.fields[0]!;
  assert.ok(insideField(field, field.x, field.z));
  const onField = pickTarget({
    mouse: { x: 0, y: 0 },
    ray: null,
    ground: { x: field.x, z: field.z },
    world: { ...world, buildings: [], villagers: { ...v, count: 0 } },
    groundY: flat,
    project: farProject,
  });
  assert.deepEqual(onField, { kind: 'field', id: field.id });
  const nothing = pickTarget({
    mouse: { x: 0, y: 0 },
    ray: down(temple.x + 500, temple.z + 500),
    ground: { x: temple.x + 500, z: temple.z + 500 },
    world: { ...world, villagers: { ...v, count: 0 } },
    groundY: flat,
    project: farProject,
  });
  assert.equal(nothing, null);
  // Indoors villagers are not pickable.
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
  );
  assert.ok(sameSelection({ kind: 'building', id: 3 }, { kind: 'building', id: 3 }));
  assert.ok(!sameSelection({ kind: 'building', id: 3 }, { kind: 'field', id: 3 }));
  assert.ok(!sameSelection({ kind: 'villager', index: 1 }, { kind: 'villager', index: 2 }));
  assert.ok(sameSelection(null, null));
}

// describe: every thing in a real hamlet and a growing village can be described.
{
  const growing = makeSim(map, { mode: 'sandbox' });
  simulate(growing, {
    hours: 1.5,
    phase: (t) => (0.3 + t / 1800) % 1,
    vigil: false,
    presence: true,
  });
  for (const sim of [hamlet, growing]) {
    const world = {
      buildings: sim.buildings,
      fields: sim.fields,
      villagers: sim.villagers,
      elder: sim.elder,
      believers: sim.believers(),
      ...extraOf(sim),
    };
    for (const b of sim.buildings) {
      const d = describe({ kind: 'building', id: b.id }, world);
      assert.ok(d && d.title.length > 0, `describes ${b.type}`);
      assert.ok(nameOf({ kind: 'building', id: b.id }, world));
    }
    for (const f of sim.fields) assert.ok(describe({ kind: 'field', id: f.id }, world));
    for (let i = 0; i < sim.villagers.count; i++) {
      const d = describe({ kind: 'villager', index: i }, world);
      assert.ok(d?.goTo && d.rows.length >= 2, 'villager rows');
      assert.ok(activityText(i, sim.villagers).length > 0);
    }
    assert.equal(describe({ kind: 'villager', index: sim.villagers.count }, world), null);
    assert.equal(describe({ kind: 'building', id: 99999 }, world), null);
    // Houses list exactly their residents, and the beds add up to the sim's total.
    const per = residentsPerBuilding(sim.villagers);
    for (const b of sim.buildings.filter((o) => o.type.startsWith('house_'))) {
      const d = describe({ kind: 'building', id: b.id }, world)!;
      if (b.stage < 2) continue;
      const listed = d.rows.filter((r) => r.target?.kind === 'villager').length;
      assert.equal(listed, per.get(b.id) ?? 0, `house ${b.id} lists its residents`);
    }
    const sum = bedSummary(sim.buildings, sim.villagers.count);
    assert.equal(sum.beds, sim.stats().beds);
    assert.equal(sum.full, sim.villagers.count >= sum.beds);
  }
  const site = growing.buildings.find((b) => b.stage < 2);
  if (site) {
    const d = describe(
      { kind: 'building', id: site.id },
      {
        buildings: growing.buildings,
        fields: growing.fields,
        villagers: growing.villagers,
        elder: growing.elder,
        believers: 0,
        ...extraOf(growing),
      },
    )!;
    assert.equal(d.subtitle, 'Being built');
    assert.ok(d.bar && d.bar.value >= 0 && d.bar.value <= 1);
  }
  // The temple, granary and workshop panels show the stock against its cap.
  {
    const world = {
      buildings: growing.buildings,
      fields: growing.fields,
      villagers: growing.villagers,
      elder: growing.elder,
      believers: growing.believers(),
      stock: { wood: 12, food: 30, woodCap: 100, foodCap: 160 },
      graves: 3,
      hunger: 'fed' as const,
    };
    const temple = growing.buildings.find((b) => b.type === 'temple')!;
    const text = (id: number) => JSON.stringify(describe({ kind: 'building', id }, world));
    assert.match(text(temple.id), /Food[^}]*30 of 160/);
    assert.match(text(temple.id), /Wood[^}]*12 of 100/);
    assert.match(text(temple.id), /Graves[^}]*3/, 'the temple panel counts the graves');
    assert.doesNotMatch(text(temple.id), /Hunger/, 'no hunger row while the village is fed');
    const hungry = JSON.stringify(
      describe({ kind: 'building', id: temple.id }, { ...world, hunger: 'weak' }),
    );
    assert.match(hungry, /Hunger[^}]*Weak/);
    const v = growing.villagers;
    v.dying[0] = 1;
    assert.equal(activityText(0, v), 'Dying');
    v.dying[0] = 0;
    for (const [type, pattern] of [
      ['granary', /30 of 160/],
      ['workshop', /12 of 100/],
    ] as const) {
      const b = growing.buildings.find((o) => o.type === type && o.stage === 2);
      if (b) assert.match(text(b.id), pattern, `${type} panel shows its stock`);
    }
  }
  // Build progress rises through the stages and ends at 1.
  const b0 = { ...hamlet.buildings[0]!, stage: 0 as const, progress: 0 };
  assert.equal(buildProgress(b0), 0);
  const b1 = { ...b0, stage: 1 as const, progress: 0 };
  assert.ok(buildProgress(b1) > 0 && buildProgress(b1) < 1);
  assert.ok(buildProgress({ ...b1, progress: 300 }) > buildProgress(b1));
  assert.equal(buildProgress({ ...b1, stage: 2 }), 1);
  // Beds only count when the building is finished.
  assert.equal(bedsOf({ ...b0, type: 'house_b' }), 0);
  assert.equal(bedsOf({ ...b0, type: 'house_b', stage: 2 }), 4);
  assert.equal(bedSummary([], 3).full, true);
}

console.log('overview-check: ok');
