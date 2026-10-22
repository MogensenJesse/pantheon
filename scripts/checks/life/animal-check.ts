// scripts/checks/life/animal-check.ts — headless checks of the farm animals: counts, walking, poses, placement and the model contract.
// Run: node --experimental-strip-types scripts/checks/life/animal-check.ts
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { life } from '../../../src/config/visual/life.ts';
import { modelFromScene } from '../../../src/life/animals/animalModelFromScene.ts';
import {
  buildChicken,
  buildSheep,
  MODEL_HEIGHT_M,
} from '../../../src/life/animals/animalModels.ts';
import { animalCount, pickPasture, pickYard } from '../../../src/life/animals/animalPlacement.ts';
import {
  type PartPose,
  type PoseParams,
  posePart,
  RIGS,
} from '../../../src/life/animals/animalPose.ts';
import {
  type AnimalEnv,
  addAnimal,
  createFlock,
  PARAMS,
  poseOf,
  stepFlock,
} from '../../../src/life/animals/animalSim.ts';
import {
  BUILDING_MARGIN_M,
  createWalkable,
  type Footprint,
  insideFootprint,
  MAX_RISE_PER_M,
} from '../../../src/life/animals/animalWalkable.ts';
import { check, finish } from '../lib/check.ts';

const A = life.ANIMALS;
const DT = 1 / 50;
const flat = { getY: () => 10, waterLevelM: 0, buildings: () => [], fields: () => [], trees: [] };
const open: AnimalEnv = { walkable: createWalkable(flat), scare: null };

function run(
  seconds: number,
  flock: ReturnType<typeof createFlock>,
  env: AnimalEnv,
  each?: () => void,
): void {
  for (let i = 0; i < seconds / DT; i++) {
    stepFlock(flock, DT, env);
    each?.();
  }
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
      const flock = createFlock('sheep', 100, 100, 9, seed);
      for (let i = 0; i < 5; i++) addAnimal(flock, open);
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
    const radius = PARAMS[kind].pastureRadiusM;
    const flock = createFlock(kind, 100, 100, radius, 3);
    for (let i = 0; i < 6; i++) addAnimal(flock, env);
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
    const flock = createFlock(kind, 0, 0, p.pastureRadiusM, 5);
    const animal = addAnimal(flock, open);
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
  const flock = createFlock('sheep', 0, 0, 9, 8);
  for (let i = 0; i < 8; i++) addAnimal(flock, open);
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
    const flock = createFlock('chicken', 0, 0, 3.5, 4);
    const hen = addAnimal(flock, open);
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
    const hens = createFlock('chicken', 0, 0, 3.5, 6);
    const sheep = createFlock('sheep', 0, 0, 9, 6);
    for (let i = 0; i < 4; i++) {
      addAnimal(hens, open);
      addAnimal(sheep, open);
    }
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

await check(
  'poses: every part of every rig gives finite, small turns; an unknown part stays at rest',
  () => {
    const out: PartPose = { rx: 0, ry: 0, rz: 0, dx: 0, dy: 0, dz: 0 };
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
    assert.deepEqual(out, { rx: 0, ry: 0, rz: 0, dx: 0, dy: 0, dz: 0 });
  },
);

await check(
  'poses: sheep legs swing in diagonal pairs and stand still at rest; the head dips to graze',
  () => {
    const out: PartPose = { rx: 0, ry: 0, rz: 0, dx: 0, dy: 0, dz: 0 };
    const rx = (part: string, pose: PoseParams) => {
      posePart('sheep', part, pose, out);
      return out.rx;
    };
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
  const out: PartPose = { rx: 0, ry: 0, rz: 0, dx: 0, dy: 0, dz: 0 };
  const rz = (part: string, pose: PoseParams) => {
    posePart('chicken', part, pose, out);
    return out.rz;
  };
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
    const flock = createFlock('sheep', 0, 0, 9, 12);
    for (let i = 0; i < 6; i++) addAnimal(flock, open);
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
  'the stand-in models match their rigs: named parts, pivots inside the body, the right height',
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
      model.dispose();
    }
    const sheep = buildSheep();
    const top = Math.max(...sheep.parts.map((p) => p.pivot[1]));
    assert.ok(top > 0.5 && top < 1.0);
    sheep.dispose();
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
    const expect = MODEL_HEIGHT_M.sheep! / 1.75;
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

finish('all animal checks passed');
