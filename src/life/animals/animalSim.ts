// src/life/animals/animalSim.ts — sheep and chickens wandering their pasture and yard (pure: node-runnable)
//
// Cosmetic and never saved: a flock is a disc, each animal rests (grazes, pecks) and then walks to a new spot in the
// disc, turning at its own pace and never walking onto ground the world says is not walkable. A scare (the orb, once
// the world is alive) makes a hen run to the far side of the yard. The same seed and the same steps give the same
// walk, so a check can replay it.

import alea from 'alea';
import { life } from '../../config/visual/life.ts';
import type { PoseParams } from './animalPose.ts';

export type AnimalKind = 'sheep' | 'chicken';
export type AnimalMode = 'rest' | 'walk' | 'flee';

const A = life.ANIMALS;
const TAU = Math.PI * 2;

export interface AnimalParams {
  walkMps: number;
  runMps: number;
  restS: readonly [number, number];
  turnRadS: number;
  strideM: number;
  gapM: number;
  /** The blob shadow's size, as a multiple of the villagers'. */
  blob: number;
  /** Scared of the orb inside this distance (0 = not at all). */
  scareRadiusM: number;
  pastureRadiusM: number;
}

export const PARAMS: Readonly<Record<AnimalKind, AnimalParams>> = {
  sheep: {
    walkMps: A.SHEEP.WALK_MPS,
    runMps: A.SHEEP.RUN_MPS,
    restS: A.SHEEP.REST_S,
    turnRadS: A.SHEEP.TURN_RAD_S,
    strideM: A.SHEEP.STRIDE_M,
    gapM: A.SHEEP.GAP_M,
    blob: A.SHEEP.BLOB,
    scareRadiusM: 0,
    pastureRadiusM: A.SHEEP.PASTURE_RADIUS_M,
  },
  chicken: {
    walkMps: A.CHICKEN.WALK_MPS,
    runMps: A.CHICKEN.RUN_MPS,
    restS: A.CHICKEN.REST_S,
    turnRadS: A.CHICKEN.TURN_RAD_S,
    strideM: A.CHICKEN.STRIDE_M,
    gapM: A.CHICKEN.GAP_M,
    blob: A.CHICKEN.BLOB,
    scareRadiusM: A.CHICKEN.SCARE_RADIUS_M,
    pastureRadiusM: A.CHICKEN.YARD_RADIUS_M,
  },
};

export interface Animal {
  kind: AnimalKind;
  x: number;
  z: number;
  yaw: number;
  /** Where it was one step ago, for drawing between steps. */
  prevX: number;
  prevZ: number;
  prevYaw: number;
  tx: number;
  tz: number;
  mode: AnimalMode;
  /** Seconds left of the rest (or the pause after a flight). */
  restT: number;
  speed: number;
  /** Stride cycles walked so far. */
  stride: number;
  /** 0..1, growing into view when the animal arrives. */
  arrive: number;
  /** The animal's own 0..1 number: its look and the offset of its idle cycles. */
  seed: number;
  /** Eased 0..1 weights of what it is doing, so poses never snap. */
  walk: number;
  rest: number;
  flee: number;
  /** Seconds of the animal's own time. */
  time: number;
}

export interface Flock {
  kind: AnimalKind;
  cx: number;
  cz: number;
  radiusM: number;
  animals: Animal[];
  rand: () => number;
}

/** What the world says: where an animal may stand, and what frightens it. */
export interface AnimalEnv {
  walkable: (x: number, z: number) => boolean;
  /** The orb (or null): hens inside their scare radius run from it. */
  scare: { x: number; z: number } | null;
}

const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * Math.min(1, rate * dt);

export function createFlock(
  kind: AnimalKind,
  cx: number,
  cz: number,
  radiusM: number,
  seed: number,
): Flock {
  return { kind, cx, cz, radiusM, animals: [], rand: alea(`${kind}:${seed}`) };
}

/** A point in the flock's disc (`inner` is the share of the radius left empty at the middle). */
function pointIn(flock: Flock, inner = 0): { x: number; z: number } {
  const angle = flock.rand() * TAU;
  const r = flock.radiusM * Math.sqrt(inner * inner + (1 - inner * inner) * flock.rand());
  return { x: flock.cx + Math.cos(angle) * r, z: flock.cz + Math.sin(angle) * r };
}

/** A new animal at the rim of the flock's disc (or its middle when the rim is not walkable), still tiny. */
export function addAnimal(flock: Flock, env: AnimalEnv): Animal {
  let spot = { x: flock.cx, z: flock.cz };
  for (let tries = 0; tries < 12; tries++) {
    const p = pointIn(flock, 0.6);
    if (env.walkable(p.x, p.z)) {
      spot = p;
      break;
    }
  }
  const yaw = flock.rand() * TAU - Math.PI;
  const params = PARAMS[flock.kind];
  const animal: Animal = {
    kind: flock.kind,
    x: spot.x,
    z: spot.z,
    yaw,
    prevX: spot.x,
    prevZ: spot.z,
    prevYaw: yaw,
    tx: spot.x,
    tz: spot.z,
    mode: 'rest',
    restT: params.restS[0] + flock.rand() * (params.restS[1] - params.restS[0]),
    speed: 0,
    stride: flock.rand(),
    arrive: 0,
    seed: flock.rand(),
    walk: 0,
    rest: 1,
    flee: 0,
    time: flock.rand() * 100,
  };
  flock.animals.push(animal);
  return animal;
}

/** Is the straight way from (x, z) to (tx, tz) walkable (sampled every half metre)? */
function clearWay(env: AnimalEnv, x: number, z: number, tx: number, tz: number): boolean {
  const dist = Math.hypot(tx - x, tz - z);
  const n = Math.max(1, Math.ceil(dist / 0.5));
  for (let i = 1; i <= n; i++) {
    if (!env.walkable(x + ((tx - x) * i) / n, z + ((tz - z) * i) / n)) return false;
  }
  return true;
}

function chooseTarget(flock: Flock, animal: Animal, env: AnimalEnv): boolean {
  for (let tries = 0; tries < 6; tries++) {
    const p = pointIn(flock);
    if (Math.hypot(p.x - animal.x, p.z - animal.z) < 0.8) continue;
    if (clearWay(env, animal.x, animal.z, p.x, p.z)) {
      animal.tx = p.x;
      animal.tz = p.z;
      return true;
    }
  }
  return false;
}

function restFor(flock: Flock, params: AnimalParams): number {
  return params.restS[0] + flock.rand() * (params.restS[1] - params.restS[0]);
}

function stepAnimal(flock: Flock, animal: Animal, dt: number, env: AnimalEnv): void {
  const params = PARAMS[flock.kind];
  animal.prevX = animal.x;
  animal.prevZ = animal.z;
  animal.prevYaw = animal.yaw;
  animal.time += dt;
  animal.arrive = Math.min(1, animal.arrive + dt / A.ARRIVE_S);

  // pushed onto ground that is no longer walkable (a building went up): back to the middle of the pasture
  if (!env.walkable(animal.x, animal.z)) {
    const back = pointIn(flock, 0);
    if (env.walkable(back.x, back.z)) {
      animal.x = back.x;
      animal.z = back.z;
      animal.prevX = back.x;
      animal.prevZ = back.z;
    }
    animal.mode = 'rest';
    animal.restT = 1;
  }

  const scare = env.scare;
  const scared =
    scare !== null &&
    params.scareRadiusM > 0 &&
    Math.hypot(animal.x - scare.x, animal.z - scare.z) < params.scareRadiusM;
  if (scared && animal.mode !== 'flee') {
    // run for the far side of the yard from what frightens it
    let best: { x: number; z: number } | null = null;
    let bestDist = -1;
    for (let tries = 0; tries < 8; tries++) {
      const p = pointIn(flock);
      const d = Math.hypot(p.x - scare.x, p.z - scare.z);
      if (d > bestDist && clearWay(env, animal.x, animal.z, p.x, p.z)) {
        best = p;
        bestDist = d;
      }
    }
    if (best) {
      animal.tx = best.x;
      animal.tz = best.z;
      animal.mode = 'flee';
    }
  }

  let moving = false;
  if (animal.mode === 'rest') {
    animal.restT -= dt;
    animal.speed = 0;
    if (animal.restT <= 0) {
      if (chooseTarget(flock, animal, env)) animal.mode = 'walk';
      else animal.restT = 1 + flock.rand() * 2;
    }
  } else {
    const dx = animal.tx - animal.x;
    const dz = animal.tz - animal.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2 || (animal.mode === 'flee' && !scared && dist < 0.6)) {
      // a hen that has run to the far side catches its breath for a moment; the rest wait as long as they like
      animal.restT = animal.mode === 'flee' ? 0.5 + flock.rand() : restFor(flock, params);
      animal.mode = 'rest';
    } else {
      const turn = wrapPi(Math.atan2(dx, dz) - animal.yaw);
      animal.yaw = wrapPi(animal.yaw + clamp(turn, -params.turnRadS * dt, params.turnRadS * dt));
      // an animal that is facing away turns on the spot before it walks
      const facing = clamp(1 - Math.abs(turn) / 1.2, 0, 1);
      const speed = (animal.mode === 'flee' ? params.runMps : params.walkMps) * facing;
      const nx = animal.x + Math.sin(animal.yaw) * speed * dt;
      const nz = animal.z + Math.cos(animal.yaw) * speed * dt;
      if (speed === 0 || env.walkable(nx, nz)) {
        animal.x = nx;
        animal.z = nz;
        animal.speed = speed;
        animal.stride += (speed * dt) / params.strideM;
        moving = speed > 0.05;
      } else {
        animal.mode = 'rest';
        animal.restT = 0.5 + flock.rand();
        animal.speed = 0;
      }
    }
  }

  animal.walk = ease(animal.walk, moving ? (animal.mode === 'flee' ? 1 : 0.55) : 0, 8, dt);
  animal.rest = ease(animal.rest, animal.mode === 'rest' ? 1 : 0, 4, dt);
  animal.flee = ease(animal.flee, animal.mode === 'flee' ? 1 : 0, 6, dt);
}

/** Step a whole flock: each animal, then a nudge apart for any two that stand too close. */
export function stepFlock(flock: Flock, dt: number, env: AnimalEnv): void {
  const params = PARAMS[flock.kind];
  for (const animal of flock.animals) stepAnimal(flock, animal, dt, env);
  const list = flock.animals;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= params.gapM) continue;
      // exactly on top of each other: any direction will do
      const ux = d > 1e-6 ? dx / d : 1;
      const uz = d > 1e-6 ? dz / d : 0;
      const push = (params.gapM - d) * 0.5 * Math.min(1, dt * 4);
      if (env.walkable(b.x + ux * push, b.z + uz * push)) {
        b.x += ux * push;
        b.z += uz * push;
      }
      if (env.walkable(a.x - ux * push, a.z - uz * push)) {
        a.x -= ux * push;
        a.z -= uz * push;
      }
    }
  }
}

/** The grazing cycle: the head goes down for most of it and comes up to look about, out of step with the others. */
function grazeHead(time: number, seed: number): number {
  const ph = (time / 9 + seed) % 1;
  const smooth = (lo: number, hi: number, x: number) => {
    const t = clamp((x - lo) / (hi - lo), 0, 1);
    return t * t * (3 - 2 * t);
  };
  return smooth(0, 0.12, ph) * (1 - smooth(0.72, 0.84, ph));
}

/** A hen's pecking: bursts of quick dips, then a pause to look round. */
function peckDip(time: number, seed: number): number {
  const burst = (time / 7 + seed) % 1 < 0.6 ? 1 : 0;
  const dip = Math.max(0, Math.sin((time / (1.1 + seed * 0.5)) * TAU));
  return burst * dip * dip;
}

/** The pose numbers (animalPose.ts) of an animal now. They are eased already, so they need no interpolation. */
export function poseOf(animal: Animal): PoseParams {
  const resting = animal.rest;
  const sheep = animal.kind === 'sheep';
  return {
    stride: animal.stride,
    walk: animal.walk,
    headDown: sheep ? grazeHead(animal.time, animal.seed) * resting : resting,
    peck: sheep ? 0 : peckDip(animal.time, animal.seed) * resting,
    flap: animal.time * 6 + animal.seed * 3,
    flapAmt: animal.flee * 0.6,
    time: animal.time,
    seed: animal.seed,
  };
}
