// src/life/animals/animals.ts — the world's animals: the village's sheep and hens, and the birds
//
// Cosmetic and never saved (a load starts them fresh). Sheep and hens come once the village is converted, in numbers
// that follow its population, and stay; the village sim is only read, never changed. Sheep graze a pasture at the edge
// of the village and hens scratch a yard beside the granary. Birds circle the woods by day on every map, and the
// places of power add flocks of their own (life/places/placeLife.ts). From Phase 1 the hens run from the orb and a flock of
// birds flies off when it comes near.
import alea from 'alea';
import type { DirectionalLight, Scene } from 'three';
import { life } from '../../config/visual/life';
import { fadeHermite, lerp, randRange, wrapAngle } from '../../core/math/scalar';
import { ambience } from '../../rendering/ambience/ambienceState';
import { weatherLook } from '../../rendering/weather/weatherLook';
import type { VillageSim } from '../../world/village/sim/villageSimTypes';
import { type AnimalModel, MODEL_KEYS, PLACEHOLDER_MODELS } from './animalModels';
import { animalCount, pickPasture, pickYard } from './animalPlacement';
import { newPose } from './animalPose';
import { type AnimalRenderer, createAnimalRenderer, type Puppet } from './animalRenderer';
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
  /** Where the orb's centre is, and whether living things notice it yet (Phase 1+). */
  orb: () => { x: number; y: number; z: number };
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
  /** A flock that belongs to a place (life/places/placeLife.ts): it circles there whatever the hour, and `level` says how many of its birds are out. */
  addBirdFlock: (spec: FlockSpec) => BirdFlock;
  /** DEV: have the farm animals now, whatever the village's state (a village of eight people that is converted). */
  setAlways: (on: boolean) => void;
  /** How many of each kind live in the village now, and how many bird flocks and birds are out (DEV and checks). */
  counts: () => Record<AnimalKind, number> & { flocks: number; birds: number };
  dispose: () => void;
}

/** What the farm and the sky each give `createAnimals`. */
interface Part {
  /** Fixed step, with the orb and whether living things notice it. */
  update: (dt: number, orb: { x: number; y: number; z: number }, notices: boolean) => void;
  /** Adds what is in view to the frame being drawn. */
  draw: (renderer: AnimalRenderer, alpha: number, viewX: number, viewZ: number) => void;
}

interface Farm extends Part {
  setAlways: (on: boolean) => void;
  counts: () => Record<AnimalKind, number>;
  dispose: () => void;
}

interface Sky extends Part {
  addFlock: (spec: FlockSpec) => BirdFlock;
  counts: () => { flocks: number; birds: number };
  dispose: () => void;
}

const KINDS: readonly AnimalKind[] = ['sheep', 'chicken'];

export function createAnimals(options: AnimalsOptions): Animals {
  const { scene } = options;

  const models = new Map<string, AnimalModel>();
  for (const key of MODEL_KEYS) {
    models.set(key, options.modelled.get(key) ?? PLACEHOLDER_MODELS[key]());
  }
  const birdCapacity = B.MAX_PER_FLOCK * (AB.FLOCKS + B.PLACE_FLOCKS);
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

  const farm = createFarm(options);
  const sky = createSky(options);
  const parts: readonly Part[] = [farm, sky];

  return {
    update: (dt) => {
      const orb = options.orb();
      const notices = options.creaturesNotice();
      for (const part of parts) part.update(dt, orb, notices);
    },
    render: (alpha, viewX, viewZ) => {
      renderer.begin();
      for (const part of parts) part.draw(renderer, alpha, viewX, viewZ);
      renderer.end();
    },
    addBirdFlock: sky.addFlock,
    setAlways: farm.setAlways,
    beginWarmup: () => renderer.beginWarmup(),
    endWarmup: () => renderer.endWarmup(),
    counts: () => ({ ...farm.counts(), ...sky.counts() }),
    dispose: () => {
      for (const mesh of renderer.meshes) scene.remove(mesh);
      renderer.dispose();
      farm.dispose();
      sky.dispose();
    },
  };
}

/** The village's sheep and hens. */
function createFarm(options: AnimalsOptions): Farm {
  const { sim } = options;
  const walkable = createWalkable({
    getY: options.getY,
    waterLevelM: options.waterLevelM,
    buildings: () => sim?.buildings ?? [],
    fields: () => sim?.fields ?? [],
    trees: options.trees,
  });
  const env: AnimalEnv = { walkable, scare: null };
  const flocks = new Map<AnimalKind, Flock>();
  let review: number = A.REVIEW_S;
  let always = false;
  let seedCount = 0;

  // scratch objects for drawing, so a frame allocates nothing
  const orbAt = { x: 0, z: 0 };
  const ground = { x: 0, z: 0 };
  const puppet: Puppet = {
    model: '',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    scale: 1,
    pose: newPose(),
    blob: 0,
    groundNx: 0,
    groundNz: 0,
  };

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

  /** The animal between two fixed steps: smaller while it grows into view, a little different each. */
  const pose = (animal: Animal, x: number, z: number, alpha: number, blob: number) => {
    puppet.model = animal.kind;
    puppet.x = x;
    puppet.y = options.getY(x, z);
    puppet.z = z;
    puppet.yaw = animal.prevYaw + wrapAngle(animal.yaw - animal.prevYaw) * alpha;
    puppet.scale = Math.max(0.02, fadeHermite(animal.arrive)) * (0.92 + animal.seed * 0.16);
    poseOf(animal, puppet.pose);
    puppet.blob = blob;
    puppet.groundNx = ground.x;
    puppet.groundNz = ground.z;
  };

  return {
    update: (dt, orb, notices) => {
      review += dt;
      if (review >= A.REVIEW_S) {
        review = 0;
        reviewVillage();
      }
      if (flocks.size === 0) return;
      orbAt.x = orb.x;
      orbAt.z = orb.z;
      env.scare = notices ? orbAt : null;
      for (const flock of flocks.values()) stepFlock(flock, dt, env);
    },
    draw: (renderer, alpha, viewX, viewZ) => {
      const range2 = A.DRAW_DISTANCE_M ** 2;
      for (const flock of flocks.values()) {
        const blob = PARAMS[flock.kind].blob;
        for (const animal of flock.animals) {
          const x = lerp(animal.prevX, animal.x, alpha);
          const z = lerp(animal.prevZ, animal.z, alpha);
          const dx = x - viewX;
          const dz = z - viewZ;
          if (dx * dx + dz * dz > range2) continue;
          options.getGroundNormal(x, z, ground);
          pose(animal, x, z, alpha, blob);
          renderer.add(puppet);
        }
      }
    },
    setAlways: (on: boolean) => {
      always = on;
      review = A.REVIEW_S;
    },
    counts: () => ({
      sheep: flocks.get('sheep')?.animals.length ?? 0,
      chicken: flocks.get('chicken')?.animals.length ?? 0,
    }),
    dispose: () => flocks.clear(),
  };
}

/** The birds: ambient flocks over the woods, and the flocks of the places of power. */
function createSky(options: AnimalsOptions): Sky {
  const flocks: BirdFlock[] = [];
  let viewX = options.orb().x;
  let viewZ = options.orb().z;

  // the woods near where the player is, picked at random
  const pickWood = (rand: () => number): { x: number; z: number } | null => {
    const near = options.woods.filter((w) => {
      const d = Math.hypot(w.x - viewX, w.z - viewZ);
      return d >= AB.CENTRE_RANGE_M[0] && d <= AB.CENTRE_RANGE_M[1];
    });
    const from = near.length > 0 ? near : options.woods;
    return from.length > 0 ? from[Math.floor(rand() * from.length)]! : null;
  };

  if (options.woods.length > 0) {
    const first = alea(`birds:first:${options.seed}`);
    for (let i = 0; i < AB.FLOCKS; i++) {
      const wood = pickWood(first);
      if (!wood) break;
      flocks.push(
        createBirdFlock(
          {
            model: 'songbird',
            place: false,
            cx: wood.x,
            cz: wood.z,
            count: Math.round(randRange(first, AB.BIRDS)),
            orbitM: randRange(first, AB.ORBIT_M),
            altitudeM: randRange(first, AB.ALTITUDE_M),
            seed: `${options.seed}:${i}`,
          },
          options.getY(wood.x, wood.z),
        ),
      );
    }
  }

  const env: BirdEnv = {
    groundY: options.getY,
    rain01: 0,
    night01: 0,
    intruder: null,
    pickCentre: pickWood,
  };
  const intruder = { x: 0, y: 0, z: 0 };

  // scratch objects for drawing, so a frame allocates nothing
  const puppet: Puppet = {
    model: '',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scale: 1,
    pose: newPose(),
    blob: 0,
    groundNx: 0,
    groundNz: 0,
  };

  /** The bird between two fixed steps; it grows into view as it comes out of the wood. */
  const pose = (model: string, bird: Bird, alpha: number, size: number) => {
    puppet.model = model;
    puppet.x = lerp(bird.prevX, bird.x, alpha);
    puppet.y = lerp(bird.prevY, bird.y, alpha);
    puppet.z = lerp(bird.prevZ, bird.z, alpha);
    puppet.yaw = bird.prevYaw + wrapAngle(bird.yaw - bird.prevYaw) * alpha;
    puppet.pitch = bird.pitch;
    puppet.roll = bird.roll;
    puppet.scale = Math.max(0.02, fadeHermite(bird.shown)) * size;
    birdPoseOf(bird, puppet.pose);
  };

  return {
    update: (dt: number, orb: { x: number; y: number; z: number }, notices: boolean) => {
      if (flocks.length === 0) return;
      env.rain01 = weatherLook.rain01;
      env.night01 = ambience.night01;
      intruder.x = orb.x;
      intruder.y = orb.y;
      intruder.z = orb.z;
      env.intruder = notices ? intruder : null;
      for (const flock of flocks) stepBirdFlock(flock, dt, env);
    },
    draw: (renderer: AnimalRenderer, alpha: number, x0: number, z0: number) => {
      viewX = x0;
      viewZ = z0;
      const range2 = B.DRAW_DISTANCE_M ** 2;
      for (const flock of flocks) {
        const size = B.MODELS[flock.model].SCALE;
        for (const bird of flock.birds) {
          if (bird.shown < 0.01) continue;
          const dx = bird.x - x0;
          const dz = bird.z - z0;
          if (dx * dx + dz * dz > range2) continue;
          pose(flock.model, bird, alpha, size);
          renderer.add(puppet);
        }
      }
    },
    addFlock: (spec: FlockSpec): BirdFlock => {
      if (flocks.length >= AB.FLOCKS + B.PLACE_FLOCKS) {
        console.warn(
          '[life] more bird flocks than the renderer has room for; the extra one is not drawn',
        );
      }
      const flock = createBirdFlock(spec, options.getY(spec.cx, spec.cz));
      flocks.push(flock);
      return flock;
    },
    counts: () => ({
      flocks: flocks.length,
      birds: flocks.reduce((n, f) => n + f.birds.filter((b) => b.shown > 0.01).length, 0),
    }),
    dispose: () => {
      flocks.length = 0;
    },
  };
}
