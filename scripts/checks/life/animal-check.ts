// scripts/checks/life/animal-check.ts — headless checks of the farm animals: counts, walking, poses, placement and the model contract.
// Run: node --experimental-strip-types scripts/checks/life/animal-check.ts
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { life } from '../../../src/config/visual/life.ts';
import { modelFromScene } from '../../../src/life/animals/animalModelFromScene.ts';
import { buildChicken, buildSheep } from '../../../src/life/animals/animalModels.ts';
import { animalCount, pickPasture, pickYard } from '../../../src/life/animals/animalPlacement.ts';
import {
  type PartPose,
  type PoseParams,
  posePart,
  RIGS,
  restPose,
} from '../../../src/life/animals/animalPose.ts';
import {
  type AnimalEnv,
  addAnimal,
  animalsWithin,
  createFlock,
  headcount,
  liftAnimal,
  PARAMS,
  poseOf,
  releaseAnimal,
  stepFlock,
  stepOwed,
} from '../../../src/life/animals/animalSim.ts';
import {
  BUILDING_MARGIN_M,
  createWalkable,
  type Footprint,
  insideFootprint,
  MAX_RISE_PER_M,
} from '../../../src/life/animals/animalWalkable.ts';
import {
  type BirdEnv,
  type BirdFlock,
  birdPoseOf,
  createBirdFlock,
  recentreBirdFlock,
  stepBirdFlock,
} from '../../../src/life/animals/birdSim.ts';
import { woodCentres } from '../../../src/life/habitat.ts';
import { check, finish } from '../lib/check.ts';

const A = life.ANIMALS;
const DT = 1 / 50;
const flat = { getY: () => 10, waterLevelM: 0, buildings: () => [], fields: () => [], trees: [] };
const open: AnimalEnv = { walkable: createWalkable(flat), scare: null };

type Kind = Parameters<typeof createFlock>[0];

/** Calls `step` for `seconds` of fixed steps, and `each` after every one. */
function stepFor(seconds: number, step: () => void, each?: () => void): void {
  for (let i = 0; i < seconds / DT; i++) {
    step();
    each?.();
  }
}

const run = (
  seconds: number,
  flock: ReturnType<typeof createFlock>,
  env: AnimalEnv,
  each?: () => void,
) => stepFor(seconds, () => stepFlock(flock, DT, env), each);

/** A flock of `count` animals of `kind` on its kind's home radius round `at`, walking in `env`. */
function flockOf(kind: Kind, count: number, seed: number, env = open, at = { x: 0, z: 0 }) {
  const flock = createFlock(kind, at.x, at.z, PARAMS[kind].homeRadiusM, seed);
  for (let i = 0; i < count; i++) addAnimal(flock, env);
  return flock;
}

await check(
  'the village keeps no animals until someone lives there, then more with its people, within limits',
  () => {
    assert.equal(animalCount('sheep', 0), 0);
    assert.equal(animalCount('chicken', 0), 0);
    assert.equal(animalCount('sheep', 1), A.SHEEP.MIN);
    assert.equal(animalCount('chicken', 1), A.CHICKEN.MIN);
    assert.equal(animalCount('sheep', 10_000), A.SHEEP.MAX);
    assert.equal(animalCount('chicken', 10_000), A.CHICKEN.MAX);
    for (const kind of ['sheep', 'chicken'] as const) {
      let last = 0;
      for (let pop = 0; pop < 200; pop++) {
        const n = animalCount(kind, pop);
        assert.ok(n >= last, `${kind} at ${pop}`);
        last = n;
      }
    }
  },
);

await check('walkable ground is dry, gentle, and clear of buildings, wheat and trees', () => {
  const home: Footprint = { x: 50, z: 50, rotY: 0.6, halfW: 3, halfD: 2 };
  const walkable = createWalkable({
    getY: (x) => (x > 100 ? 0.1 : x > 80 ? 10 + (x - 80) * 1.5 : 10),
    waterLevelM: 0,
    buildings: () => [home],
    fields: () => [{ x: 20, z: 20, rotY: 0, halfW: 4, halfD: 4 }],
    trees: [{ x: 30, z: 30 }],
  });
  assert.equal(walkable(0, 0), true, 'open ground');
  assert.equal(walkable(110, 0), false, 'the shore and below');
  assert.equal(walkable(90, 0), false, `steeper than ${MAX_RISE_PER_M} per metre`);
  assert.equal(walkable(50, 50), false, 'inside a house');
  assert.equal(walkable(30.3, 30), false, 'at a trunk');
  assert.equal(walkable(22, 22), false, 'in the wheat');
  // the house is turned: a point just off its corner along the long axis is blocked, but not a point further out
  const along = (m: number) => ({
    x: home.x + Math.cos(home.rotY) * m,
    z: home.z - Math.sin(home.rotY) * m,
  });
  assert.ok(
    insideFootprint(
      home,
      along(home.halfW + BUILDING_MARGIN_M - 0.05).x,
      along(home.halfW + BUILDING_MARGIN_M - 0.05).z,
      BUILDING_MARGIN_M,
    ),
  );
  assert.equal(
    walkable(
      along(home.halfW + BUILDING_MARGIN_M + 0.5).x,
      along(home.halfW + BUILDING_MARGIN_M + 0.5).z,
    ),
    true,
  );
});

await check(
  'a flock is the same every time from the same seed, and different from another seed',
  () => {
    const make = (seed: number) => {
      const flock = flockOf('sheep', 5, seed, open, { x: 100, z: 100 });
      run(60, flock, open);
      return flock.animals.map((a) => [a.x, a.z, a.yaw]);
    };
    assert.deepEqual(make(1), make(1));
    assert.notDeepEqual(make(1), make(2));
  },
);

await check('animals stay inside their disc and on walkable ground for five minutes', () => {
  const block: Footprint = { x: 104, z: 100, rotY: 0.4, halfW: 2, halfD: 1.5 };
  const env: AnimalEnv = {
    walkable: createWalkable({ ...flat, buildings: () => [block] }),
    scare: null,
  };
  for (const kind of ['sheep', 'chicken'] as const) {
    const radius = PARAMS[kind].homeRadiusM;
    const flock = flockOf(kind, 6, 3, env, { x: 100, z: 100 });
    run(300, flock, env, () => {
      for (const a of flock.animals) {
        assert.ok(Math.hypot(a.x - 100, a.z - 100) <= radius + 0.5, `${kind} left its disc`);
        assert.ok(env.walkable(a.x, a.z), `${kind} stands on ground it may not`);
      }
    });
  }
});

await check('animals turn at a sensible rate and walk no faster than their pace', () => {
  for (const kind of ['sheep', 'chicken'] as const) {
    const p = PARAMS[kind];
    // alone, so that nothing nudges it apart from a neighbour
    const flock = flockOf(kind, 1, 5);
    const animal = flock.animals[0]!;
    let moved = 0;
    run(120, flock, open, () => {
      const dyaw = Math.abs(
        Math.atan2(Math.sin(animal.yaw - animal.prevYaw), Math.cos(animal.yaw - animal.prevYaw)),
      );
      assert.ok(dyaw <= p.turnRadS * DT + 1e-9, `${kind} turned ${dyaw}`);
      const step = Math.hypot(animal.x - animal.prevX, animal.z - animal.prevZ);
      assert.ok(step <= p.walkMps * DT + 1e-9, `${kind} stepped ${step}`);
      moved += step;
    });
    assert.ok(moved > 5, `${kind} wander (${moved.toFixed(1)} m in total)`);
  }
});

await check('animals do not stand on each other', () => {
  const flock = flockOf('sheep', 8, 8);
  const gap = PARAMS.sheep.gapM;
  let worst = Infinity;
  run(180, flock, open, () => {
    const list = flock.animals;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        worst = Math.min(worst, Math.hypot(list[i]!.x - list[j]!.x, list[i]!.z - list[j]!.z));
      }
    }
  });
  assert.ok(worst > gap * 0.4, `closest two came within ${worst.toFixed(2)} m (gap ${gap})`);
});

await check(
  'a new arrival grows into view over ARRIVE_S, and one pushed onto a new building is moved off it',
  () => {
    const flock = flockOf('chicken', 1, 4);
    const hen = flock.animals[0]!;
    assert.equal(hen.arrive, 0);
    run(A.ARRIVE_S / 2, flock, open);
    assert.ok(hen.arrive > 0.4 && hen.arrive < 0.6, `halfway ${hen.arrive}`);
    run(A.ARRIVE_S, flock, open);
    assert.equal(hen.arrive, 1);

    const footprint: Footprint = { x: hen.x, z: hen.z, rotY: 0, halfW: 1, halfD: 1 };
    let built = false;
    const env: AnimalEnv = {
      walkable: createWalkable({ ...flat, buildings: () => (built ? [footprint] : []) }),
      scare: null,
    };
    built = true;
    assert.equal(env.walkable(hen.x, hen.z), false);
    run(0.5, flock, env);
    assert.ok(env.walkable(hen.x, hen.z), 'moved off the new building');
  },
);

await check(
  'hens run from the orb at the run pace, sheep do not mind it, and hens settle when it goes',
  () => {
    const orb = { x: 0.5, z: 0 };
    const hens = flockOf('chicken', 4, 6);
    const sheep = flockOf('sheep', 4, 6);
    const scared: AnimalEnv = { walkable: open.walkable, scare: orb };
    let fastest = 0;
    let sheepFastest = 0;
    run(8, hens, scared, () => {
      for (const a of hens.animals) fastest = Math.max(fastest, a.speed);
    });
    run(8, sheep, scared, () => {
      for (const a of sheep.animals) sheepFastest = Math.max(sheepFastest, a.speed);
    });
    assert.ok(fastest > PARAMS.chicken.walkMps * 1.5, `hens ran at ${fastest.toFixed(2)} m/s`);
    assert.ok(fastest <= PARAMS.chicken.runMps + 1e-6);
    assert.ok(sheepFastest <= PARAMS.sheep.walkMps + 1e-6, 'sheep only walk');
    run(20, hens, open);
    for (const a of hens.animals)
      assert.ok(a.mode !== 'flee', 'the flight is over once the orb is gone');
  },
);

const sweep: PoseParams[] = [];
for (const walk of [0, 0.5, 1]) {
  for (const stride of [0, 0.25, 0.5, 0.8]) {
    for (const head of [0, 1]) {
      sweep.push({
        stride,
        walk,
        headDown: head,
        peck: head,
        flap: stride,
        flapAmt: walk,
        time: 3.3,
        seed: 0.4,
      });
    }
  }
}

/** What `part` of `model` does in `pose`. */
function partTurn(model: string, part: string, pose: PoseParams): PartPose {
  const out = restPose();
  posePart(model, part, pose, out);
  return out;
}

await check(
  'poses: every part of every rig gives finite, small turns; an unknown part stays at rest',
  () => {
    const out = restPose();
    for (const [model, rig] of Object.entries(RIGS)) {
      for (const part of Object.keys(rig)) {
        for (const pose of sweep) {
          assert.equal(posePart(model, part, pose, out), true);
          for (const v of Object.values(out)) assert.ok(Number.isFinite(v));
          assert.ok(
            Math.abs(out.rx) < 2 && Math.abs(out.ry) < 2 && Math.abs(out.rz) < 2,
            `${model}.${part}`,
          );
          assert.ok(
            Math.abs(out.dx) < 0.2 && Math.abs(out.dy) < 0.2 && Math.abs(out.dz) < 0.2,
            `${model}.${part}`,
          );
        }
      }
    }
    const rest = { ...sweep[0]!, walk: 0 };
    assert.equal(posePart('sheep', 'horn', rest, out), false);
    assert.deepEqual(out, restPose());
  },
);

await check(
  'poses: sheep legs swing in diagonal pairs and stand still at rest; the head dips to graze',
  () => {
    const rx = (part: string, pose: PoseParams) => partTurn('sheep', part, pose).rx;
    const walking: PoseParams = { ...sweep[0]!, stride: 0.25, walk: 1 };
    assert.ok(
      Math.abs(rx('leg_fl', walking) - rx('leg_br', walking)) < 1e-12,
      'front left and back right together',
    );
    assert.ok(
      Math.abs(rx('leg_fl', walking) + rx('leg_fr', walking)) < 1e-12,
      'front left and front right opposed',
    );
    assert.ok(Math.abs(rx('leg_fl', walking)) > 0.3);
    assert.equal(rx('leg_fl', { ...walking, walk: 0 }), 0, 'standing');
    assert.ok(
      rx('head', { ...walking, walk: 0, headDown: 1 }) >
        rx('head', { ...walking, walk: 0, headDown: 0 }) + 0.5,
    );
  },
);

await check('poses: hens flap their wings in opposite senses only when they run', () => {
  const rz = (part: string, pose: PoseParams) => partTurn('chicken', part, pose).rz;
  const running: PoseParams = { ...sweep[0]!, flap: 0.25, flapAmt: 0.6 };
  assert.ok(
    rz('wing_r', running) > 0.5 && rz('wing_l', running) < -0.5,
    'the right wing up, the left up the other way',
  );
  const resting: PoseParams = { ...running, flapAmt: 0 };
  assert.ok(Math.abs(rz('wing_r', resting)) < 0.2, 'folded');
});

await check(
  'the pose of a resting animal follows what it does: grazing sheep put their heads down, walking ones do not',
  () => {
    const flock = flockOf('sheep', 6, 12);
    let downWhileResting = 0;
    let downWhileWalking = 0;
    run(240, flock, open, () => {
      for (const a of flock.animals) {
        const pose = poseOf(a);
        assert.ok(pose.headDown >= 0 && pose.headDown <= 1 && pose.walk >= 0 && pose.walk <= 1);
        if (a.mode === 'rest' && a.rest > 0.9)
          downWhileResting = Math.max(downWhileResting, pose.headDown);
        if (a.mode === 'walk' && a.rest < 0.05)
          downWhileWalking = Math.max(downWhileWalking, pose.headDown);
      }
    });
    assert.ok(downWhileResting > 0.9, 'they graze');
    assert.ok(downWhileWalking < 0.1, 'they look up to walk');
  },
);

await check(
  'the yard goes beside the granary on clear ground; the pasture on the roomiest side of the village edge',
  () => {
    const buildings = [
      { type: 'temple', x: 0, z: 0, rotY: 0, halfW: 5, halfD: 5 },
      { type: 'granary', x: 14, z: 3, rotY: 0.3, halfW: 3, halfD: 2.5 },
      { type: 'house_a', x: -12, z: 6, rotY: 1, halfW: 3, halfD: 2.5 },
    ];
    const walkable = createWalkable({ ...flat, buildings: () => buildings });
    const input = { centreX: 0, centreZ: 0, radiusM: 40, buildings, fields: [], walkable };
    const yard = pickYard(input);
    assert.ok(yard, 'a yard');
    assert.ok(Math.hypot(yard.x - 14, yard.z - 3) < 12, 'beside the granary');
    assert.ok(walkable(yard.x, yard.z));
    const pasture = pickPasture(input);
    assert.ok(pasture, 'a pasture');
    assert.ok(Math.hypot(pasture.x, pasture.z) > 40, 'beyond the village');

    // no dry ground, no home for either
    const sea = createWalkable({ ...flat, getY: () => -5 });
    assert.equal(pickYard({ ...input, walkable: sea }), null);
    assert.equal(pickPasture({ ...input, walkable: sea }), null);
    // no granary or house, no yard
    assert.equal(pickYard({ ...input, buildings: [buildings[0]!] }), null);
  },
);

await check(
  'the stand-in models match their rigs: named parts, pivots inside the body, on the ground, about their standing height',
  () => {
    for (const [model, rigKey] of [
      [buildSheep(), 'sheep'],
      [buildChicken(), 'chicken'],
    ] as const) {
      const names = new Set(model.parts.map((p) => p.name));
      for (const rigPart of Object.keys(RIGS[rigKey]!))
        assert.ok(names.has(rigPart), `${rigKey} has ${rigPart}`);
      const box = new Box3();
      for (const part of model.parts) {
        for (const draw of part.draws) {
          draw.geometry.computeBoundingBox();
          box.union(
            draw.geometry
              .boundingBox!.clone()
              .translate({ x: part.pivot[0], y: part.pivot[1], z: part.pivot[2] } as never),
          );
          // built relative to its pivot: the pivot is near the part
          const c = draw.geometry.boundingBox!.getCenter(new Box3().min);
          assert.ok(
            Math.hypot(c.x, c.y, c.z) < 0.7,
            `${rigKey}.${part.name} is built round its pivot`,
          );
        }
      }
      assert.ok(box.min.y > -0.01 && box.min.y < 0.02, `${rigKey} stands on y = 0 (${box.min.y})`);
      assert.ok(box.max.z > 0.1, `${rigKey} has a front on +z`);
      const target = life.MODEL_HEIGHT_M[rigKey];
      assert.ok(
        Math.abs(box.max.y - target) < target * 0.15,
        `${rigKey} stands ${box.max.y.toFixed(2)} m high, the target is ${target} m`,
      );
      model.dispose();
    }
  },
);

await check(
  'a modelled file is read as parts: nodes named for parts, pivots at their origins, scaled to the target height',
  () => {
    const material = new MeshStandardMaterial({ name: 'sheep_atlas' });
    const scene = new Group();
    const root = new Group();
    root.name = 'sheep';
    scene.add(root);
    // a model made 2× too big: body 1.2 m high at y 1.2, head hanging from a neck joint, four legs
    const node = (
      name: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const g = new Group();
      g.name = name;
      g.position.set(x, y, z);
      const m = new Mesh(new BoxGeometry(sx, sy, sz), material);
      m.name = `${name}.001`;
      g.add(m);
      root.add(g);
    };
    node('body', 0, 1.2, 0, 1.2, 1, 1.9);
    node('head', 0, 1.5, 0.9, 0.4, 0.5, 0.6);
    for (const [n, x, z] of [
      ['leg_fl', -0.4, 0.7],
      ['leg_fr', 0.4, 0.7],
      ['leg_bl', -0.4, -0.7],
      ['leg_br', 0.4, -0.7],
    ] as const) {
      node(n, x, 0.4, z, 0.2, 0.8, 0.2);
    }
    const model = modelFromScene('sheep', scene);
    assert.ok(model);
    const names = model.parts.map((p) => p.name).sort();
    assert.deepEqual(names, ['body', 'head', 'leg_bl', 'leg_br', 'leg_fl', 'leg_fr']);
    const head = model.parts.find((p) => p.name === 'head')!;
    assert.deepEqual(head.pivot, [0, 1.5, 0.9]);
    head.draws[0]!.geometry.computeBoundingBox();
    const centre = head.draws[0]!.geometry.boundingBox!.getCenter(new Box3().min);
    assert.ok(Math.hypot(centre.x, centre.y, centre.z) < 1e-6, 'the head is built round its joint');
    // its height runs from the soles of the feet (0) to the top of the head (1.75)
    const expect = life.MODEL_HEIGHT_M.sheep / 1.75;
    assert.ok(Math.abs(model.scale - expect) < 1e-6, `scale ${model.scale} vs ${expect}`);
    assert.ok(Math.abs(model.footY) < 1e-6, 'standing on the ground');
    // a model made floating half a metre up is sunk to the ground and scaled the same
    const floating = new Group();
    const raised = root.clone();
    for (const child of raised.children) child.position.y += 0.5;
    floating.add(raised);
    const sunk = modelFromScene('sheep', floating);
    assert.ok(sunk && Math.abs(sunk.footY - 0.5) < 1e-6 && Math.abs(sunk.scale - expect) < 1e-6);
    sunk?.dispose();
    assert.equal(modelFromScene('sheep', new Group()), null, 'an empty file is no model');
    model.dispose();
  },
);

const B = life.BIRDS;
const AB = B.AMBIENT;
const skyEnv = (over: Partial<BirdEnv> = {}): BirdEnv => ({
  groundY: () => 10,
  rain01: 0,
  night01: 0,
  intruder: null,
  pickCentre: () => ({ x: 300, z: 0 }),
  ...over,
});
const newFlock = (place = false, level = 1, count = 8): BirdFlock =>
  createBirdFlock(
    { model: 'songbird', place, cx: 0, cz: 0, count, orbitM: 20, altitudeM: 20, seed: 4, level },
    10,
  );
const runBirds = (flock: BirdFlock, seconds: number, env: BirdEnv, each?: () => void) =>
  stepFor(seconds, () => stepBirdFlock(flock, DT, env), each);
const shownCount = (f: BirdFlock) => f.birds.filter((b) => b.shown > 0.99).length;

await check('woods: cells with enough trees, at the middle of their trees', () => {
  const trees = [
    ...Array.from({ length: 10 }, (_, i) => ({ key: 'fir_1', x: 100 + i, z: 100 + i })),
    ...Array.from({ length: 3 }, (_, i) => ({ key: 'fir_1', x: 500 + i, z: 500 })),
  ];
  const woods = woodCentres(trees);
  assert.equal(woods.length, 1, 'three trees are not a wood');
  assert.ok(Math.abs(woods[0]!.x - 104.5) < 1e-9 && Math.abs(woods[0]!.z - 104.5) < 1e-9);
  assert.deepEqual(woodCentres([]), []);
});

await check('birds: circle at their height round the wood, no faster than a bird flies', () => {
  const flock = newFlock();
  let top = 0;
  runBirds(flock, 30, skyEnv(), () => {
    for (const b of flock.birds) {
      const r = Math.hypot(b.x - flock.cx, b.z - flock.cz);
      assert.ok(r < 20 * 1.2 + 4, `radius ${r}`);
      assert.ok(b.y > 10 + 20 * 0.85 - 1.5 && b.y < 10 + 20 * 1.15 + 1.5, `height ${b.y}`);
      top = Math.max(top, Math.hypot(b.x - b.prevX, b.z - b.prevZ) / DT);
    }
  });
  assert.ok(top > 3 && top < AB.TRANSIT_MPS + 2, `fastest ${top.toFixed(1)} m/s`);
});

await check(
  'birds: an ambient flock comes out by day, settles at night and in rain, and a place flock ignores the night',
  () => {
    const ambient = newFlock(false);
    runBirds(ambient, B.FADE_S * 2, skyEnv());
    assert.equal(shownCount(ambient), 8, 'out by day');
    runBirds(ambient, B.FADE_S * 2, skyEnv({ night01: 1 }));
    assert.equal(shownCount(ambient), 0, 'in at night');
    runBirds(ambient, B.FADE_S * 2, skyEnv());
    assert.equal(shownCount(ambient), 8);
    runBirds(ambient, B.FADE_S * 2, skyEnv({ rain01: 1 }));
    assert.equal(shownCount(ambient), 0, 'in the rain');

    const place = newFlock(true);
    runBirds(place, B.FADE_S * 2, skyEnv({ night01: 1 }));
    assert.equal(shownCount(place), 8, 'a place flock stays out at night');
    runBirds(place, B.FADE_S * 2, skyEnv({ night01: 1, rain01: 1 }));
    assert.equal(shownCount(place), 0, 'but not in the rain');
  },
);

await check('birds: the level says how many are out, and they come and go gradually', () => {
  const flock = newFlock(true, 0);
  runBirds(flock, B.FADE_S * 2, skyEnv());
  assert.equal(shownCount(flock), 0);
  flock.level = 0.5;
  runBirds(flock, B.FADE_S * 2, skyEnv());
  assert.equal(shownCount(flock), 4);
  flock.level = 1;
  let biggestJump = 0;
  let last = flock.birds.reduce((n, b) => n + b.shown, 0);
  runBirds(flock, B.FADE_S * 2, skyEnv(), () => {
    const total = flock.birds.reduce((n, b) => n + b.shown, 0);
    biggestJump = Math.max(biggestJump, Math.abs(total - last));
    last = total;
  });
  assert.equal(shownCount(flock), 8);
  assert.ok(biggestJump < 0.2, `birds appear in a step of ${biggestJump}`);
});

await check(
  'birds: an ambient flock moves on to another wood now and then, and a place flock never does',
  () => {
    const ambient = newFlock(false);
    runBirds(ambient, 60, skyEnv());
    ambient.modeT = 0;
    runBirds(ambient, 1, skyEnv());
    assert.equal(ambient.mode, 'transit');
    let fastest = 0;
    runBirds(ambient, 120, skyEnv(), () => {
      fastest = Math.max(fastest, ambient.speed);
    });
    assert.equal(ambient.mode, 'circle', 'it arrived');
    assert.ok(Math.hypot(ambient.cx - 300, ambient.cz) < 15, 'at the new wood');
    assert.ok(fastest <= AB.TRANSIT_MPS + 1e-6);

    const place = newFlock(true);
    place.modeT = 0;
    runBirds(place, 600, skyEnv());
    assert.equal(place.mode, 'circle');
    assert.ok(Math.hypot(place.cx, place.cz) < 1e-9, 'it stays at its place');
  },
);

await check(
  'birds: a place flock put at its place has its birds there at once, the share of the level out, and no streak',
  () => {
    const place = newFlock(true, 0);
    assert.equal(shownCount(place), 0);
    recentreBirdFlock(place, 400, -250, 30, 0.5);
    assert.equal(shownCount(place), 4, 'half of 8 are out already');
    for (const b of place.birds) {
      assert.ok(Math.hypot(b.x - 400, b.z + 250) < 20 * 1.2 + 4, 'round the new place');
      assert.ok(b.y > 30 + 20 * 0.85 - 1.5, 'at the new ground');
      assert.equal(b.prevX, b.x, 'no streak from the old place');
      assert.equal(b.prevZ, b.z);
    }
    let fastest = 0;
    runBirds(place, 5, skyEnv({ groundY: () => 30 }), () => {
      for (const b of place.birds) {
        fastest = Math.max(fastest, Math.hypot(b.x - b.prevX, b.z - b.prevZ) / DT);
      }
    });
    assert.ok(fastest < AB.TRANSIT_MPS + 2, `fastest ${fastest.toFixed(1)} m/s`);
    assert.equal(shownCount(place), 4, 'the share stays where the level says');
    recentreBirdFlock(place, 0, 0, 10, 1);
    assert.equal(shownCount(place), 8);
  },
);

await check(
  'birds: the orb scares an ambient flock off at the flee pace, but not a place flock',
  () => {
    // on the circle the birds fly, at their height
    const orb = { x: 20, y: 30, z: 0 };
    const ambient = newFlock(false);
    runBirds(ambient, 5, skyEnv());
    assert.notEqual(ambient.mode, 'transit');
    let fastest = 0;
    runBirds(ambient, 20, skyEnv({ intruder: orb }), () => {
      fastest = Math.max(fastest, ambient.speed);
    });
    assert.ok(ambient.fleeing || ambient.cx > 50, 'it flew off');
    assert.ok(fastest > AB.TRANSIT_MPS + 1, `fled at ${fastest.toFixed(1)} m/s`);
    assert.ok(fastest <= AB.FLEE_MPS + 1e-6);

    const place = newFlock(true);
    runBirds(place, 20, skyEnv({ intruder: orb }));
    assert.equal(place.mode, 'circle');

    // far from the orb nothing happens
    const calm = newFlock(false);
    runBirds(calm, 20, skyEnv({ intruder: { x: 500, y: 0, z: 500 } }));
    assert.equal(calm.fleeing, false);
  },
);

await check('birds: they bank into the turn and beat their wings, and the pose is finite', () => {
  const flock = newFlock(true);
  let bank = 0;
  let beat = 0;
  runBirds(flock, 20, skyEnv(), () => {
    for (const b of flock.birds) {
      bank = Math.max(bank, Math.abs(b.roll));
      beat = Math.max(beat, b.flapAmt);
      for (const v of Object.values(birdPoseOf(b))) assert.ok(Number.isFinite(v));
      assert.ok(Math.abs(b.pitch) <= 0.5 + 1e-9 && Math.abs(b.roll) <= 0.7 + 1e-9);
    }
  });
  assert.ok(bank > 0.05, `banked ${bank.toFixed(2)}`);
  assert.ok(beat > 0.9);
  // gliding between wingbeats: the wings open less for a moment
  let narrowest = 1;
  runBirds(flock, 30, skyEnv(), () => {
    for (const b of flock.birds) narrowest = Math.min(narrowest, b.flapAmt);
  });
  assert.ok(narrowest < 0.4, `narrowest ${narrowest.toFixed(2)}`);
});

// --- the orb's hand ---

/** A flock of four sheep, all full grown. */
function grownSheep(seed: string) {
  const flock = createFlock('sheep', 0, 0, A.SHEEP.HOME_RADIUS_M, seed);
  for (let i = 0; i < 4; i++) addAnimal(flock, open);
  stepFor(A.ARRIVE_S + 0.5, () => stepFlock(flock, DT, open));
  return flock;
}

await check('hand: a lifted sheep leaves the flock, does not walk, and is still counted', () => {
  const flock = grownSheep('lift');
  const spots = animalsWithin(flock, 0, 0, 1000, []);
  assert.equal(spots.length, 4);
  assert.equal(new Set(spots.map((s) => s.id)).size, 4, 'each has its own id');
  assert.equal(animalsWithin(flock, 1000, 1000, 5, []).length, 0, 'only those in reach');
  const id = spots[1]!.id;
  assert.equal(liftAnimal(flock, id), true);
  assert.equal(flock.animals.length, 3);
  assert.equal(headcount(flock), 4, 'the village still counts it');
  assert.equal(liftAnimal(flock, spots[2]!.id), false, 'the hand holds one at a time');
  assert.equal(liftAnimal(createFlock('sheep', 0, 0, 9, 'none'), 0), false, 'nothing to lift');
  assert.ok(!animalsWithin(flock, 0, 0, 1000, []).some((s) => s.id === id), 'no longer to aim at');
  const held = flock.held!;
  const at = { x: held.x, z: held.z };
  stepFor(5, () => stepFlock(flock, DT, open));
  assert.deepEqual({ x: held.x, z: held.z }, at, 'a lifted sheep stays where it was lifted');
});

await check('hand: let go, the sheep is back in the flock where it was lifted', () => {
  const flock = grownSheep('back');
  const id = animalsWithin(flock, 0, 0, 1000, [])[0]!.id;
  assert.ok(liftAnimal(flock, id));
  const { x, z } = flock.held!;
  assert.equal(releaseAnimal(flock, 'back'), true);
  assert.equal(flock.held, null);
  assert.equal(flock.animals.length, 4);
  const back = flock.animals.find((a) => a.id === id)!;
  assert.deepEqual({ x: back.x, z: back.z }, { x, z });
  assert.equal(back.prevX, x, 'no streak across the pasture');
  assert.equal(headcount(flock), 4);
  assert.equal(releaseAnimal(flock, 'back'), false, 'letting go twice does nothing');
  assert.equal(flock.owed.length, 0);
});

await check('hand: a delivered sheep is replaced after a while, small first', () => {
  const flock = grownSheep('consumed');
  const id = animalsWithin(flock, 0, 0, 1000, [])[0]!.id;
  assert.ok(liftAnimal(flock, id));
  assert.equal(releaseAnimal(flock, 'consumed'), true);
  assert.equal(flock.animals.length, 3);
  assert.equal(headcount(flock), 4, 'the village waits for its replacement instead of refilling');
  assert.equal(flock.owed.length, 1);
  const wait = flock.owed[0]!;
  assert.ok(wait >= A.RESPAWN_S[0] && wait <= A.RESPAWN_S[1], `waits ${wait.toFixed(0)} s`);
  assert.equal(stepOwed(flock, wait - 1, open), 0, 'not yet');
  assert.equal(flock.animals.length, 3);
  assert.equal(stepOwed(flock, 2, open), 1, 'then it comes');
  assert.equal(flock.animals.length, 4);
  assert.equal(flock.owed.length, 0);
  const fresh = flock.animals.at(-1)!;
  assert.ok(fresh.arrive < 1 && fresh.id !== id, 'a new sheep, growing into view');
  assert.equal(liftAnimal(flock, fresh.id), false, 'and not liftable until it is grown');
  assert.equal(animalsWithin(flock, 0, 0, 1000, []).length, 3);
});

await check('hand: the same lifts give the same flock', () => {
  const play = () => {
    const flock = grownSheep('same');
    const id = animalsWithin(flock, 0, 0, 1000, [])[2]!.id;
    liftAnimal(flock, id);
    releaseAnimal(flock, 'consumed');
    stepFor(200, () => {
      stepFlock(flock, DT, open);
      stepOwed(flock, DT, open);
    });
    return JSON.stringify(flock.animals);
  };
  assert.equal(play(), play());
});

finish('all animal checks passed');
