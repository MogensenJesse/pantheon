// src/life/animals/animalSim.ts — sheep and chickens wandering their pasture and yard (pure: node-runnable)
//
// Cosmetic and never saved: a flock is a disc, each animal rests (grazes, pecks) and then walks to a new spot in the
// disc, turning at its own pace and never walking onto ground the world says is not walkable. A scare (the orb, once
// the world is alive) makes a hen run to the far side of the yard. The same seed and the same steps give the same
// walk, so a check can replay it.

import alea from 'alea';
import { life } from '../../config/visual/life.ts';
import {
  approach,
  clamp,
  randRange,
  smoothstepEdges,
  TAU,
  wrapAngle,
} from '../../core/math/scalar.ts';
import { newPose, type PoseParams } from './animalPose.ts';

export type AnimalKind = 'sheep' | 'chicken';
export type AnimalMode = 'rest' | 'walk' | 'flee';

const A = life.ANIMALS;

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
  /** The radius of the pasture or yard the flock keeps to. */
  homeRadiusM: number;
}

const paramsOf = (c: typeof A.SHEEP | typeof A.CHICKEN): AnimalParams => ({
  walkMps: c.WALK_MPS,
  runMps: c.RUN_MPS,
  restS: c.REST_S,
  turnRadS: c.TURN_RAD_S,
  strideM: c.STRIDE_M,
  gapM: c.GAP_M,
  blob: c.BLOB,
  scareRadiusM: c.SCARE_RADIUS_M,
  homeRadiusM: c.HOME_RADIUS_M,
});

export const PARAMS: Readonly<Record<AnimalKind, AnimalParams>> = {
  sheep: paramsOf(A.SHEEP),
  chicken: paramsOf(A.CHICKEN),
};

export interface Animal {
  /** Counted up per flock, so the orb's hand can name one. */
  id: number;
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
  nextId: number;
  /** The animal the orb's hand carries: out of `animals` (it neither walks nor counts as grazing) until it is let go. */
  held: Animal | null;
  /** Seconds until each animal the hand took away is replaced. */
  owed: number[];
}

/** What the world says: where an animal may stand, and what frightens it. */
export interface AnimalEnv {
  walkable: (x: number, z: number) => boolean;
  /** The orb (or null): hens inside their scare radius run from it. */
  scare: { x: number; z: number } | null;
}

export function createFlock(
  kind: AnimalKind,
  cx: number,
  cz: number,
  radiusM: number,
  seed: number | string,
): Flock {
  return {
    kind,
    cx,
    cz,
    radiusM,
    animals: [],
    rand: alea(`${kind}:${seed}`),
    nextId: 0,
    held: null,
    owed: [],
  };
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
    id: flock.nextId++,
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
    restT: randRange(flock.rand, params.restS),
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

/** How many animals the village counts for this flock: grazing, carried by the hand, or on their way back. */
export const headcount = (flock: Flock): number =>
  flock.animals.length + flock.owed.length + (flock.held ? 1 : 0);

/** Where an animal the hand could lift stands. */
export interface AnimalSpot {
  id: number;
  x: number;
  z: number;
}

/** The animals within `radiusM` of (x, z) that are full grown and free, written to `out`. */
export function animalsWithin(
  flock: Flock,
  x: number,
  z: number,
  radiusM: number,
  out: AnimalSpot[],
): AnimalSpot[] {
  out.length = 0;
  for (const a of flock.animals) {
    if (a.arrive < 1 || Math.hypot(a.x - x, a.z - z) > radiusM) continue;
    out.push({ id: a.id, x: a.x, z: a.z });
  }
  return out;
}

/** The hand takes animal `id` out of the flock. False when the hand already holds one, or the animal is not there. */
export function liftAnimal(flock: Flock, id: number): boolean {
  if (flock.held) return false;
  const i = flock.animals.findIndex((a) => a.id === id && a.arrive >= 1);
  if (i < 0) return false;
  flock.held = flock.animals[i]!;
  flock.animals.splice(i, 1);
  return true;
}

/**
 * The hand lets go. `'back'` puts the animal in the flock again where it was lifted; `'consumed'` is the end of it
 * (a delivered animal is gone) and the village gets a new one after `RESPAWN_S`. Returns false when nothing was held.
 */
export function releaseAnimal(flock: Flock, how: 'back' | 'consumed'): boolean {
  const animal = flock.held;
  if (!animal) return false;
  flock.held = null;
  if (how === 'consumed') {
    flock.owed.push(randRange(flock.rand, A.RESPAWN_S));
    return true;
  }
  animal.prevX = animal.x;
  animal.prevZ = animal.z;
  animal.prevYaw = animal.yaw;
  animal.mode = 'rest';
  animal.speed = 0;
  animal.restT = randRange(flock.rand, PARAMS[flock.kind].restS);
  flock.animals.push(animal);
  return true;
}

/** Counts the replacements down; each one that is due arrives at the rim of the flock's disc. Returns how many came. */
export function stepOwed(flock: Flock, dt: number, env: AnimalEnv): number {
  let came = 0;
  for (let i = flock.owed.length - 1; i >= 0; i--) {
    flock.owed[i] = flock.owed[i]! - dt;
    if (flock.owed[i]! > 0) continue;
    flock.owed.splice(i, 1);
    addAnimal(flock, env);
    came++;
  }
  return came;
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
  return randRange(flock.rand, params.restS);
}

/** Pushed onto ground that is no longer walkable (a building went up): back to the middle of the pasture. */
function returnToMiddle(flock: Flock, animal: Animal, env: AnimalEnv): void {
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

/** Run for the far side of the yard from what frightens it. */
function startFlee(flock: Flock, animal: Animal, env: AnimalEnv, from: { x: number; z: number }) {
  let best: { x: number; z: number } | null = null;
  let bestDist = -1;
  for (let tries = 0; tries < 8; tries++) {
    const p = pointIn(flock);
    const d = Math.hypot(p.x - from.x, p.z - from.z);
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

/** Resting: when the rest is over, pick a spot to walk to (or rest a little longer if there is no clear way). */
function stepRest(flock: Flock, animal: Animal, dt: number, env: AnimalEnv): void {
  animal.restT -= dt;
  animal.speed = 0;
  if (animal.restT > 0) return;
  if (chooseTarget(flock, animal, env)) animal.mode = 'walk';
  else animal.restT = 1 + flock.rand() * 2;
}

/** Walking or fleeing toward the target; returns whether the animal moved. */
function stepMove(
  flock: Flock,
  animal: Animal,
  params: AnimalParams,
  dt: number,
  env: AnimalEnv,
  scared: boolean,
): boolean {
  const dx = animal.tx - animal.x;
  const dz = animal.tz - animal.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.2 || (animal.mode === 'flee' && !scared && dist < 0.6)) {
    // a hen that has run to the far side catches its breath for a moment; the rest wait as long as they like
    animal.restT = animal.mode === 'flee' ? 0.5 + flock.rand() : restFor(flock, params);
    animal.mode = 'rest';
    return false;
  }
  const turn = wrapAngle(Math.atan2(dx, dz) - animal.yaw);
  animal.yaw = wrapAngle(animal.yaw + clamp(turn, -params.turnRadS * dt, params.turnRadS * dt));
  // an animal that is facing away turns on the spot before it walks
  const facing = clamp(1 - Math.abs(turn) / 1.2, 0, 1);
  const speed = (animal.mode === 'flee' ? params.runMps : params.walkMps) * facing;
  const nx = animal.x + Math.sin(animal.yaw) * speed * dt;
  const nz = animal.z + Math.cos(animal.yaw) * speed * dt;
  if (speed !== 0 && !env.walkable(nx, nz)) {
    animal.mode = 'rest';
    animal.restT = 0.5 + flock.rand();
    animal.speed = 0;
    return false;
  }
  animal.x = nx;
  animal.z = nz;
  animal.speed = speed;
  animal.stride += (speed * dt) / params.strideM;
  return speed > 0.05;
}

function stepAnimal(flock: Flock, animal: Animal, dt: number, env: AnimalEnv): void {
  const params = PARAMS[flock.kind];
  animal.prevX = animal.x;
  animal.prevZ = animal.z;
  animal.prevYaw = animal.yaw;
  animal.time += dt;
  animal.arrive = Math.min(1, animal.arrive + dt / A.ARRIVE_S);

  if (!env.walkable(animal.x, animal.z)) returnToMiddle(flock, animal, env);

  const scare = env.scare;
  const scared =
    scare !== null &&
    params.scareRadiusM > 0 &&
    Math.hypot(animal.x - scare.x, animal.z - scare.z) < params.scareRadiusM;
  if (scare && scared && animal.mode !== 'flee') startFlee(flock, animal, env, scare);

  let moving = false;
  if (animal.mode === 'rest') stepRest(flock, animal, dt, env);
  else moving = stepMove(flock, animal, params, dt, env, scared);

  animal.walk = approach(animal.walk, moving ? (animal.mode === 'flee' ? 1 : 0.55) : 0, 8, dt);
  animal.rest = approach(animal.rest, animal.mode === 'rest' ? 1 : 0, 4, dt);
  animal.flee = approach(animal.flee, animal.mode === 'flee' ? 1 : 0, 6, dt);
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
  return smoothstepEdges(0, 0.12, ph) * (1 - smoothstepEdges(0.72, 0.84, ph));
}

/** A hen's pecking: bursts of quick dips, then a pause to look round. */
function peckDip(time: number, seed: number): number {
  const burst = (time / 7 + seed) % 1 < 0.6 ? 1 : 0;
  const dip = Math.max(0, Math.sin((time / (1.1 + seed * 0.5)) * TAU));
  return burst * dip * dip;
}

/** The pose numbers (animalPose.ts) of an animal now, written into `out` when given. They are eased already, so they need no interpolation. */
export function poseOf(animal: Animal, out: PoseParams = newPose()): PoseParams {
  const resting = animal.rest;
  const sheep = animal.kind === 'sheep';
  out.stride = animal.stride;
  out.walk = animal.walk;
  out.headDown = sheep ? grazeHead(animal.time, animal.seed) * resting : resting;
  out.peck = sheep ? 0 : peckDip(animal.time, animal.seed) * resting;
  out.flap = animal.time * 6 + animal.seed * 3;
  out.flapAmt = animal.flee * 0.6;
  out.time = animal.time;
  out.seed = animal.seed;
  return out;
}
