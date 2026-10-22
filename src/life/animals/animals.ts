// src/life/animals/animals.ts — the world's animals: the village's sheep and hens, and the birds
//
// Cosmetic and never saved (a load starts them fresh). Sheep and hens come once the village is converted, in numbers
// that follow its population, and stay; the village sim is only read, never changed. Sheep graze a pasture at the edge
// of the village and hens scratch a yard beside the granary. Birds circle the woods by day on every map. From Phase 1
// the hens run from the orb and a flock flies off when it comes near.
import type { DirectionalLight, Scene } from 'three';
import { life } from '../../config/visual/life';
import { ambience } from '../../rendering/ambience/ambienceState';
import { weatherLook } from '../../rendering/weather/weatherLook';
import type { VillageSim } from '../../world/village/sim/villageSimTypes';
import { type AnimalModel, PLACEHOLDER_MODELS } from './animalModels';
import { animalCount, pickPasture, pickYard } from './animalPlacement';
import { createAnimalRenderer, type Puppet } from './animalRenderer';
import {
  type Animal,
  type AnimalEnv,
  type AnimalKind,
  addAnimal,
  createFlock,
  type Flock,
  PARAMS,
  poseOf,
  stepFlock,
} from './animalSim';
import { createWalkable } from './animalWalkable';
import {
  type Bird,
  type BirdEnv,
  type BirdFlock,
  birdPoseOf,
  createBirdFlock,
  type FlockSpec,
  stepBirdFlock,
} from './birdSim';

const A = life.ANIMALS;
const B = life.BIRDS;
const AB = B.AMBIENT;

export interface AnimalsOptions {
  scene: Scene;
  sun: DirectionalLight;
  /** The village, or null on a map without one (then there are only birds). */
  sim: VillageSim | null;
  /** Modelled animals by key (from `loadAnimalKit`); keys not in it use the stand-ins. */
  modelled: ReadonlyMap<string, AnimalModel>;
  getY: (x: number, z: number) => number;
  getGroundNormal: (x: number, z: number, out: { x: number; z: number }) => void;
  waterLevelM: number;
  /** The map's trees: animals walk round them and the woods are where the birds circle. */
  trees: readonly { x: number; z: number }[];
  /** The middles of the woods (life/habitat.ts `woodCentres`). */
  woods: readonly { x: number; z: number }[];
  /** Where the orb is, and whether living things notice it yet (Phase 1+). */
  orb: () => { x: number; z: number };
  creaturesNotice: () => boolean;
  /** Seeds the flocks, so the same map starts the same way. */
  seed: number;
}

export interface Animals {
  /** Fixed step. */
  update: (dt: number) => void;
  /** Once a frame, with the camera position and the interpolation between fixed steps. */
  render: (alpha: number, viewX: number, viewZ: number) => void;
  beginWarmup: () => void;
  endWarmup: () => void;
  /** A flock that belongs to a place (L7): it circles there whatever the hour, and `level` says how many of its birds are out. */
  addBirdFlock: (spec: FlockSpec) => BirdFlock;
  /** DEV: have the farm animals now, whatever the village's state (a village of eight people that is converted). */
  setAlways: (on: boolean) => void;
  /** How many of each kind live in the village now, and how many bird flocks and birds are out (DEV and checks). */
  counts: () => Record<AnimalKind, number> & { flocks: number; birds: number };
  dispose: () => void;
}

const KINDS: readonly AnimalKind[] = ['sheep', 'chicken'];
/** How often (s) the village is looked at again for new arrivals and a home for the flocks. */
const REVIEW_S = 2;
/** The most bird flocks the renderer has room for: the ambient ones and a few places'. */
const PLACE_FLOCKS = 4;

const wrapPi = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const between = (rand: () => number, range: readonly [number, number]) =>
  range[0] + rand() * (range[1] - range[0]);

export function createAnimals(options: AnimalsOptions): Animals {
  const { scene, sim } = options;

  const models = new Map<string, AnimalModel>();
  for (const key of ['sheep', 'chicken', 'songbird', 'dove']) {
    models.set(key, options.modelled.get(key) ?? PLACEHOLDER_MODELS[key]!());
  }
  const birdCapacity = B.MAX_PER_FLOCK * (AB.FLOCKS + PLACE_FLOCKS);
  const renderer = createAnimalRenderer({
    sun: options.sun,
    models,
    capacity: {
      sheep: A.SHEEP.MAX + 2,
      chicken: A.CHICKEN.MAX + 2,
      songbird: birdCapacity,
      dove: birdCapacity,
    },
  });
  for (const mesh of renderer.meshes) scene.add(mesh);

  const walkable = createWalkable({
    getY: options.getY,
    waterLevelM: options.waterLevelM,
    buildings: () => sim?.buildings ?? [],
    fields: () => sim?.fields ?? [],
    trees: options.trees,
  });
  const env: AnimalEnv = { walkable, scare: null };

  const flocks = new Map<AnimalKind, Flock>();
  let review = REVIEW_S;
  let always = false;
  let seedCount = 0;

  /** Find the pasture and the yard once there is a village to read, then add whoever the population calls for. */
  const reviewVillage = () => {
    if (!sim || (!sim.converted && !always)) return;
    const population = always ? Math.max(8, sim.villagers.count) : sim.villagers.count;
    const placement = {
      centreX: sim.seed.x,
      centreZ: sim.seed.z,
      radiusM: sim.seed.radiusM,
      buildings: sim.buildings,
      fields: sim.fields,
      walkable,
    };
    for (const kind of KINDS) {
      const want = animalCount(kind, population);
      if (want === 0) continue;
      let flock = flocks.get(kind);
      if (!flock) {
        const anchor = kind === 'sheep' ? pickPasture(placement) : pickYard(placement);
        if (!anchor) continue;
        flock = createFlock(
          kind,
          anchor.x,
          anchor.z,
          anchor.radiusM,
          `${options.seed}:${seedCount++}`,
        );
        flocks.set(kind, flock);
      }
      // animals never leave: the flock only grows with the village
      while (flock.animals.length < want) addAnimal(flock, env);
    }
  };

  // birds: the woods near where the player is, picked at random
  let viewX = options.orb().x;
  let viewZ = options.orb().z;
  const pickWood = (rand: () => number): { x: number; z: number } | null => {
    const near = options.woods.filter((w) => {
      const d = Math.hypot(w.x - viewX, w.z - viewZ);
      return d >= AB.CENTRE_RANGE_M[0] && d <= AB.CENTRE_RANGE_M[1];
    });
    const from = near.length > 0 ? near : options.woods;
    return from.length > 0 ? from[Math.floor(rand() * from.length)]! : null;
  };

  const birdFlocks: BirdFlock[] = [];
  if (options.woods.length > 0) {
    const first = createBirdFlockRand(options.seed);
    for (let i = 0; i < AB.FLOCKS; i++) {
      const wood = pickWood(first);
      if (!wood) break;
      birdFlocks.push(
        createBirdFlock(
          {
            model: 'songbird',
            place: false,
            cx: wood.x,
            cz: wood.z,
            count: Math.round(between(first, AB.BIRDS)),
            orbitM: between(first, AB.ORBIT_M),
            altitudeM: between(first, AB.ALTITUDE_M),
            seed: `${options.seed}:${i}`,
          },
          options.getY(wood.x, wood.z),
        ),
      );
    }
  }

  const birdEnv: BirdEnv = {
    groundY: options.getY,
    rain01: 0,
    night01: 0,
    intruder: null,
    pickCentre: pickWood,
  };
  const intruder = { x: 0, y: 0, z: 0 };

  const orbAt = { x: 0, z: 0 };
  const ground = { x: 0, z: 0 };

  return {
    update: (dt) => {
      review += dt;
      if (review >= REVIEW_S) {
        review = 0;
        reviewVillage();
      }
      const orb = options.orb();
      const notices = options.creaturesNotice();
      if (flocks.size > 0) {
        orbAt.x = orb.x;
        orbAt.z = orb.z;
        env.scare = notices ? orbAt : null;
        for (const flock of flocks.values()) stepFlock(flock, dt, env);
      }
      if (birdFlocks.length > 0) {
        birdEnv.rain01 = weatherLook.rain01;
        birdEnv.night01 = ambience.night01;
        intruder.x = orb.x;
        intruder.y = options.getY(orb.x, orb.z) + 1.2;
        intruder.z = orb.z;
        birdEnv.intruder = notices ? intruder : null;
        for (const flock of birdFlocks) stepBirdFlock(flock, dt, birdEnv);
      }
    },
    render: (alpha, x0, z0) => {
      viewX = x0;
      viewZ = z0;
      renderer.begin();
      const farm2 = A.DRAW_DISTANCE_M ** 2;
      for (const flock of flocks.values()) {
        const params = PARAMS[flock.kind];
        for (const animal of flock.animals) {
          const x = animal.prevX + (animal.x - animal.prevX) * alpha;
          const z = animal.prevZ + (animal.z - animal.prevZ) * alpha;
          const dx = x - x0;
          const dz = z - z0;
          if (dx * dx + dz * dz > farm2) continue;
          options.getGroundNormal(x, z, ground);
          renderer.add(puppetOf(animal, x, z, alpha, options.getY(x, z), params.blob, ground));
        }
      }
      const sky2 = B.DRAW_DISTANCE_M ** 2;
      for (const flock of birdFlocks) {
        const size = B.MODELS[flock.model].SCALE;
        for (const bird of flock.birds) {
          if (bird.shown < 0.01) continue;
          const dx = bird.x - x0;
          const dz = bird.z - z0;
          if (dx * dx + dz * dz > sky2) continue;
          renderer.add(birdPuppet(flock.model, bird, alpha, size));
        }
      }
      renderer.end();
    },
    addBirdFlock: (spec) => {
      const flock = createBirdFlock(spec, options.getY(spec.cx, spec.cz));
      birdFlocks.push(flock);
      return flock;
    },
    setAlways: (on) => {
      always = on;
      review = REVIEW_S;
    },
    beginWarmup: () => renderer.beginWarmup(),
    endWarmup: () => renderer.endWarmup(),
    counts: () => ({
      sheep: flocks.get('sheep')?.animals.length ?? 0,
      chicken: flocks.get('chicken')?.animals.length ?? 0,
      flocks: birdFlocks.length,
      birds: birdFlocks.reduce((n, f) => n + f.birds.filter((b) => b.shown > 0.01).length, 0),
    }),
    dispose: () => {
      for (const mesh of renderer.meshes) scene.remove(mesh);
      renderer.dispose();
    },
  };
}

/** A small seeded generator for the flocks' first choices. */
function createBirdFlockRand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** The puppet of an animal between two fixed steps: smaller while it grows into view, a little different each. */
function puppetOf(
  animal: Animal,
  x: number,
  z: number,
  alpha: number,
  y: number,
  blob: number,
  ground: { x: number; z: number },
): Puppet {
  const grow = animal.arrive * animal.arrive * (3 - 2 * animal.arrive);
  return {
    model: animal.kind,
    x,
    y,
    z,
    yaw: animal.prevYaw + wrapPi(animal.yaw - animal.prevYaw) * alpha,
    scale: Math.max(0.02, grow) * (0.92 + animal.seed * 0.16),
    pose: poseOf(animal),
    blob,
    groundNx: ground.x,
    groundNz: ground.z,
  };
}

/** The puppet of a bird between two fixed steps; it grows into view as it comes out of the wood. */
function birdPuppet(model: string, bird: Bird, alpha: number, size: number): Puppet {
  const grow = bird.shown * bird.shown * (3 - 2 * bird.shown);
  return {
    model,
    x: bird.prevX + (bird.x - bird.prevX) * alpha,
    y: bird.prevY + (bird.y - bird.prevY) * alpha,
    z: bird.prevZ + (bird.z - bird.prevZ) * alpha,
    yaw: bird.prevYaw + wrapPi(bird.yaw - bird.prevYaw) * alpha,
    pitch: bird.pitch,
    roll: bird.roll,
    scale: Math.max(0.02, grow) * size,
    pose: birdPoseOf(bird),
    blob: 0,
    groundNx: 0,
    groundNz: 0,
  };
}
