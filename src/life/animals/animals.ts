// src/life/animals/animals.ts — the village's sheep and hens: when they come, where they live, how they are drawn
//
// Cosmetic and never saved (a load starts them fresh). They come once the village is converted, in numbers that
// follow its population, and stay; the village sim is only read, never changed. Sheep graze a pasture at the edge of
// the village and hens scratch a yard beside the granary. From Phase 1 the hens run from the orb.
import type { DirectionalLight, Scene } from 'three';
import { life } from '../../config/visual/life';
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

const A = life.ANIMALS;

export interface AnimalsOptions {
  scene: Scene;
  sun: DirectionalLight;
  sim: VillageSim;
  /** Modelled animals by key (from `loadAnimalKit`); keys not in it use the stand-ins. */
  modelled: ReadonlyMap<string, AnimalModel>;
  getY: (x: number, z: number) => number;
  getGroundNormal: (x: number, z: number, out: { x: number; z: number }) => void;
  waterLevelM: number;
  /** The map's trees, which animals walk round. */
  trees: readonly { x: number; z: number }[];
  /** Where the orb is, and whether living things notice it yet (Phase 1+). */
  orb: () => { x: number; z: number };
  creaturesNotice: () => boolean;
}

export interface Animals {
  /** Fixed step. */
  update: (dt: number) => void;
  /** Once a frame, with the camera position and the interpolation between fixed steps. */
  render: (alpha: number, viewX: number, viewZ: number) => void;
  beginWarmup: () => void;
  endWarmup: () => void;
  /** DEV: have the animals now, whatever the village's state (a village of eight people that is converted). */
  setAlways: (on: boolean) => void;
  /** How many of each kind live in the village now (DEV and checks). */
  counts: () => Record<AnimalKind, number>;
  dispose: () => void;
}

const KINDS: readonly AnimalKind[] = ['sheep', 'chicken'];
/** How often (s) the village is looked at again for new arrivals and a home for the flocks. */
const REVIEW_S = 2;

const wrapPi = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

export function createAnimals(options: AnimalsOptions): Animals {
  const { scene, sim } = options;

  const models = new Map<string, AnimalModel>();
  for (const kind of KINDS) {
    models.set(kind, options.modelled.get(kind) ?? PLACEHOLDER_MODELS[kind]!());
  }
  const renderer = createAnimalRenderer({
    sun: options.sun,
    models,
    capacity: { sheep: A.SHEEP.MAX + 2, chicken: A.CHICKEN.MAX + 2 },
  });
  for (const mesh of renderer.meshes) scene.add(mesh);

  const walkable = createWalkable({
    getY: options.getY,
    waterLevelM: options.waterLevelM,
    buildings: () => sim.buildings,
    fields: () => sim.fields,
    trees: options.trees,
  });
  const env: AnimalEnv = { walkable, scare: null };

  const flocks = new Map<AnimalKind, Flock>();
  let review = REVIEW_S;
  let always = false;
  let seedCount = 0;

  /** Find the pasture and the yard once there is a village to read, then add whoever the population calls for. */
  const reviewVillage = () => {
    if (!sim.converted && !always) return;
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
          sim.seed.x * 31 + sim.seed.z + seedCount++,
        );
        flocks.set(kind, flock);
      }
      // animals never leave: the flock only grows with the village
      while (flock.animals.length < want) addAnimal(flock, env);
    }
  };

  const orbAt = { x: 0, z: 0 };
  const ground = { x: 0, z: 0 };

  return {
    update: (dt) => {
      review += dt;
      if (review >= REVIEW_S) {
        review = 0;
        reviewVillage();
      }
      if (flocks.size === 0) return;
      const orb = options.orb();
      orbAt.x = orb.x;
      orbAt.z = orb.z;
      env.scare = options.creaturesNotice() ? orbAt : null;
      for (const flock of flocks.values()) stepFlock(flock, dt, env);
    },
    render: (alpha, viewX, viewZ) => {
      renderer.begin();
      const maxDist2 = A.DRAW_DISTANCE_M ** 2;
      for (const flock of flocks.values()) {
        const params = PARAMS[flock.kind];
        for (const animal of flock.animals) {
          const x = animal.prevX + (animal.x - animal.prevX) * alpha;
          const z = animal.prevZ + (animal.z - animal.prevZ) * alpha;
          const dx = x - viewX;
          const dz = z - viewZ;
          if (dx * dx + dz * dz > maxDist2) continue;
          options.getGroundNormal(x, z, ground);
          renderer.add(puppetOf(animal, x, z, alpha, options.getY(x, z), params.blob, ground));
        }
      }
      renderer.end();
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
    }),
    dispose: () => {
      for (const mesh of renderer.meshes) scene.remove(mesh);
      renderer.dispose();
    },
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
