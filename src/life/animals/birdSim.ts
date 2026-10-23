// src/life/animals/birdSim.ts — flocks of birds circling a place, moving on and flying off (pure: node-runnable)
//
// Cosmetic and never saved. A flock has a centre and a circle round it that its birds fly at their own radius and
// height. An ambient flock circles a wood by day, now and then moves on to another wood (the centre travels and the
// circle closes up into a loose cluster), and flies off when the orb comes near. A place's flock (life/placeLife.ts) only circles its
// place. Birds appear and vanish gradually (a flock comes out of the wood, or settles into it as it gets dark or rains).
// What each bird does with its body (banking into the turn, climbing, gliding between wingbeats) comes from its
// own movement.

import alea from 'alea';
import { life } from '../../config/visual/life.ts';
import type { PoseParams } from './animalPose.ts';

const B = life.BIRDS;
const AB = B.AMBIENT;
const TAU = Math.PI * 2;

export type BirdModel = 'songbird' | 'dove';
export type FlockMode = 'circle' | 'transit';

export interface Bird {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  yaw: number;
  prevYaw: number;
  pitch: number;
  roll: number;
  /** Wingbeat phase in cycles, and how wide the wings beat (small while gliding). */
  flap: number;
  flapAmt: number;
  gliding: boolean;
  /** Seconds to the next change between beating and gliding. */
  phaseT: number;
  /** Where on the circle, and the bird's own radius, height and number. */
  phi: number;
  radiusMul: number;
  altMul: number;
  seed: number;
  /** 0..1: how much of the bird is out; it grows and shrinks, so it never pops. */
  shown: number;
  time: number;
}

export interface BirdFlock {
  model: BirdModel;
  /** A place's flock only circles its place, whatever the hour. */
  place: boolean;
  cx: number;
  cz: number;
  groundY: number;
  orbitBase: number;
  orbitR: number;
  altitude: number;
  angle: number;
  speed: number;
  mode: FlockMode;
  /** Seconds left of the circling before the flock moves on. */
  modeT: number;
  tx: number;
  tz: number;
  fleeing: boolean;
  /** 0..1: the share of the flock's birds that are out. */
  level: number;
  birds: Bird[];
  rand: () => number;
}

export interface BirdEnv {
  groundY: (x: number, z: number) => number;
  rain01: number;
  night01: number;
  /** The orb when creatures notice it (Phase 1+), else null. */
  intruder: { x: number; y: number; z: number } | null;
  /** Another wood to move on to, or null when the map has none. */
  pickCentre: (rand: () => number) => { x: number; z: number } | null;
}

export interface FlockSpec {
  model: BirdModel;
  place: boolean;
  cx: number;
  cz: number;
  count: number;
  orbitM: number;
  altitudeM: number;
  seed: number | string;
  /** The share of the birds out at first (an ambient flock starts full, a place's at its level). */
  level?: number;
}

const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const between = (rand: () => number, range: readonly [number, number]) =>
  range[0] + rand() * (range[1] - range[0]);

export function createBirdFlock(spec: FlockSpec, groundY: number): BirdFlock {
  const rand = alea(`birds:${spec.model}:${spec.seed}`);
  const count = Math.min(B.MAX_PER_FLOCK, Math.max(1, spec.count));
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    birds.push({
      x: spec.cx,
      y: groundY + spec.altitudeM,
      z: spec.cz,
      prevX: spec.cx,
      prevY: groundY + spec.altitudeM,
      prevZ: spec.cz,
      yaw: rand() * TAU - Math.PI,
      prevYaw: 0,
      pitch: 0,
      roll: 0,
      flap: rand(),
      flapAmt: 1,
      gliding: false,
      phaseT: 1 + rand() * 3,
      phi: (i / count) * TAU + (rand() - 0.5) * 0.5,
      radiusMul: 0.8 + rand() * 0.4,
      altMul: 0.85 + rand() * 0.3,
      seed: rand(),
      shown: 0,
      time: rand() * 100,
    });
  }
  const flock: BirdFlock = {
    model: spec.model,
    place: spec.place,
    cx: spec.cx,
    cz: spec.cz,
    groundY,
    orbitBase: spec.orbitM,
    orbitR: spec.orbitM,
    altitude: spec.altitudeM,
    angle: rand() * TAU,
    speed: AB.SPEED_MPS,
    mode: 'circle',
    modeT: between(rand, AB.CIRCLE_S),
    tx: spec.cx,
    tz: spec.cz,
    fleeing: false,
    level: spec.level ?? 1,
    birds,
    rand,
  };
  placeBirds(flock, 0);
  for (const bird of birds) {
    bird.prevX = bird.x;
    bird.prevY = bird.y;
    bird.prevZ = bird.z;
    bird.prevYaw = bird.yaw;
  }
  return flock;
}

/**
 * Moves a flock to a place at once. Its birds are put on the new circle with no streak across the map, and the
 * share `level` of them is out already, so a load (or a DEV place) shows the flock as it should be with no fade-in.
 */
export function recentreBirdFlock(
  flock: BirdFlock,
  cx: number,
  cz: number,
  groundY: number,
  level: number,
): void {
  flock.cx = cx;
  flock.cz = cz;
  flock.tx = cx;
  flock.tz = cz;
  flock.groundY = groundY;
  flock.orbitR = flock.orbitBase;
  flock.mode = 'circle';
  flock.fleeing = false;
  flock.level = level;
  placeBirds(flock, 0);
  const out = Math.ceil(level * flock.birds.length - 1e-9);
  for (let i = 0; i < flock.birds.length; i++) {
    const bird = flock.birds[i]!;
    bird.prevX = bird.x;
    bird.prevY = bird.y;
    bird.prevZ = bird.z;
    bird.prevYaw = bird.yaw;
    bird.shown = i < out ? 1 : 0;
  }
}

/** Put every bird where the circle says; with dt > 0 also turn them toward where they are heading. */
function placeBirds(flock: BirdFlock, dt: number): void {
  const looseness = 1.5 + (1 - clamp(flock.orbitR / flock.orbitBase, 0, 1)) * 3;
  for (const bird of flock.birds) {
    bird.prevX = bird.x;
    bird.prevY = bird.y;
    bird.prevZ = bird.z;
    bird.prevYaw = bird.yaw;
    const a = flock.angle + bird.phi;
    const r = flock.orbitR * bird.radiusMul;
    bird.x = flock.cx + Math.cos(a) * r + Math.sin(bird.time * 0.7 + bird.seed * TAU) * looseness;
    bird.z = flock.cz + Math.sin(a) * r + Math.cos(bird.time * 0.6 + bird.seed * 5) * looseness;
    bird.y =
      flock.groundY + flock.altitude * bird.altMul + Math.sin(bird.time * 0.5 + bird.seed * 9);
    if (dt <= 0) continue;

    const vx = (bird.x - bird.prevX) / dt;
    const vy = (bird.y - bird.prevY) / dt;
    const vz = (bird.z - bird.prevZ) / dt;
    const flat = Math.hypot(vx, vz);
    if (flat > 0.5) {
      const target = Math.atan2(vx, vz);
      bird.yaw = wrapPi(bird.prevYaw + wrapPi(target - bird.prevYaw) * Math.min(1, dt * 8));
      const turn = wrapPi(bird.yaw - bird.prevYaw) / dt;
      // lean into the turn: a left turn (yaw growing) lowers the left wing, which sits on +x
      bird.roll += (-clamp(turn * 0.45, -0.7, 0.7) - bird.roll) * Math.min(1, dt * 5);
      bird.pitch += (-clamp(Math.atan2(vy, flat), -0.5, 0.5) - bird.pitch) * Math.min(1, dt * 5);
    }
  }
}

function startTransit(
  flock: BirdFlock,
  env: BirdEnv,
  fleeing: boolean,
  away?: { x: number; z: number },
): void {
  const centre = env.pickCentre(flock.rand);
  if (centre) {
    flock.tx = centre.x;
    flock.tz = centre.z;
  } else if (away) {
    // no other wood: just get well away from what frightened it
    const dx = flock.cx - away.x;
    const dz = flock.cz - away.z;
    const d = Math.hypot(dx, dz) || 1;
    flock.tx = flock.cx + (dx / d) * 300;
    flock.tz = flock.cz + (dz / d) * 300;
  } else {
    flock.modeT = between(flock.rand, AB.CIRCLE_S);
    return;
  }
  flock.mode = 'transit';
  flock.fleeing = fleeing;
  flock.speed = fleeing ? AB.FLEE_MPS : AB.TRANSIT_MPS;
}

/** Step a flock: whether it is out, where its centre goes, then every bird that is out. */
export function stepBirdFlock(flock: BirdFlock, dt: number, env: BirdEnv): void {
  // out by day and in fair weather (a place's flock whatever the hour); settling into the wood otherwise
  const fair = env.rain01 < AB.RAIN_MAX && (flock.place || env.night01 < AB.NIGHT_MAX);
  const out = fair ? Math.ceil(flock.level * flock.birds.length - 1e-9) : 0;
  const fade = dt / B.FADE_S;
  let anyShown = false;
  flock.birds.forEach((bird, i) => {
    bird.shown = clamp(bird.shown + clamp((i < out ? 1 : 0) - bird.shown, -fade, fade), 0, 1);
    if (bird.shown > 0) anyShown = true;
  });

  flock.groundY += (env.groundY(flock.cx, flock.cz) - flock.groundY) * Math.min(1, dt * 0.5);

  if (flock.mode === 'circle') {
    flock.orbitR += (flock.orbitBase - flock.orbitR) * Math.min(1, dt * 0.4);
    flock.speed += (AB.SPEED_MPS - flock.speed) * Math.min(1, dt);
    flock.modeT -= dt;
    if (!flock.place && flock.modeT <= 0) startTransit(flock, env, false);
  } else {
    flock.orbitR += (3 - flock.orbitR) * Math.min(1, dt * 0.6);
    const dx = flock.tx - flock.cx;
    const dz = flock.tz - flock.cz;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) {
      flock.mode = 'circle';
      flock.fleeing = false;
      flock.modeT = between(flock.rand, AB.CIRCLE_S);
    } else {
      const move = Math.min(dist, flock.speed * dt);
      flock.cx += (dx / dist) * move;
      flock.cz += (dz / dist) * move;
    }
  }

  // the orb comes close to one of the birds: the flock flies off (a place's flock stays)
  if (!flock.place && !flock.fleeing && env.intruder && anyShown) {
    const o = env.intruder;
    for (const bird of flock.birds) {
      if (bird.shown < 0.5) continue;
      if (Math.hypot(bird.x - o.x, bird.y - o.y, bird.z - o.z) < AB.SCARE_M) {
        startTransit(flock, env, true, o);
        break;
      }
    }
  }

  flock.angle = wrapPi(flock.angle + (flock.speed / Math.max(flock.orbitR, 6)) * dt);
  for (const bird of flock.birds) bird.time += dt;
  if (!anyShown) return;
  placeBirds(flock, dt);

  const hz = B.MODELS[flock.model].FLAP_HZ;
  for (const bird of flock.birds) {
    bird.phaseT -= dt;
    if (bird.phaseT <= 0) {
      bird.gliding = !bird.gliding;
      bird.phaseT = bird.gliding ? 0.6 + flock.rand() * 1.2 : 1.5 + flock.rand() * 2.5;
    }
    bird.flapAmt += ((bird.gliding ? 0.12 : 1) - bird.flapAmt) * Math.min(1, dt * 6);
    bird.flap += hz * (0.9 + bird.seed * 0.2) * dt;
  }
}

/** The pose numbers (animalPose.ts) of a bird now. */
export function birdPoseOf(bird: Bird): PoseParams {
  return {
    stride: 0,
    walk: 0,
    headDown: 0,
    peck: 0,
    flap: bird.flap,
    flapAmt: bird.flapAmt,
    time: bird.time,
    seed: bird.seed,
  };
}
