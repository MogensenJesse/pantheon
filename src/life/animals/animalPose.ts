// src/life/animals/animalPose.ts — how the rigid parts of an animal move (pure: node-runnable)
//
// Every animal is a set of separately named rigid parts, each hanging from a pivot at its joint (no skinning, no
// clips). A pose is a few numbers (the stride, how far the head is down, how hard the wings beat); a rig turns them
// into a small rotation and shift per part name. The renderer applies them to the part's matrix about its pivot.
// A part the rig does not know stays at rest, so a modelled animal with fewer parts still works.

import { TAU } from '../../core/math/scalar.ts';

export interface PoseParams {
  /** Legs: stride phase in cycles (one cycle is a left and a right step), and how hard they swing, 0 (standing) .. 1 (running). */
  stride: number;
  walk: number;
  /** The head, 0 (up, looking about) .. 1 (down at the grass); the peck is a quick dip on top of it. */
  headDown: number;
  peck: number;
  /** Wings: beat phase in cycles and how wide they beat, 0 (folded) .. 1. */
  flap: number;
  flapAmt: number;
  /** Seconds of the animal's own time, for the tail and the idle sway. */
  time: number;
  /** The animal's own 0..1 number, so no two move in step. */
  seed: number;
}

/** A pose of nothing: for a caller that writes the numbers into one object and reuses it. */
export function newPose(): PoseParams {
  return { stride: 0, walk: 0, headDown: 0, peck: 0, flap: 0, flapAmt: 0, time: 0, seed: 0 };
}

/** A part's turn about its pivot (radians, X then Y then Z) and shift (metres). */
export interface PartPose {
  rx: number;
  ry: number;
  rz: number;
  dx: number;
  dy: number;
  dz: number;
}

export type RigFn = (pose: PoseParams, out: PartPose) => void;

export const restPose = (): PartPose => ({ rx: 0, ry: 0, rz: 0, dx: 0, dy: 0, dz: 0 });

const swing =
  (sign: number, amplitude: number): RigFn =>
  (p, out) => {
    out.rx = Math.sin(p.stride * TAU) * amplitude * p.walk * sign;
  };

/** Sheep: legs swing in diagonal pairs, the head goes down to graze, the tail twitches. */
const SHEEP: Record<string, RigFn> = {
  body: (p, out) => {
    out.dy = Math.abs(Math.sin(p.stride * TAU)) * 0.025 * p.walk;
    out.rz = Math.sin(p.stride * TAU) * 0.03 * p.walk;
  },
  head: (p, out) => {
    out.rx = p.headDown * 0.75 + Math.sin(p.time * 1.7 + p.seed * 9) * 0.04 * (1 - p.headDown);
    out.dz = p.headDown * 0.04;
  },
  leg_fl: swing(1, 0.55),
  leg_br: swing(1, 0.55),
  leg_fr: swing(-1, 0.55),
  leg_bl: swing(-1, 0.55),
  tail: (p, out) => {
    out.rx = Math.sin(p.time * 4 + p.seed * 7) * 0.12;
  },
};

/** Hens: the head bobs with each step and dips to peck, the legs trot, the wings only open to run or fly. */
const CHICKEN: Record<string, RigFn> = {
  body: (p, out) => {
    out.dy = Math.abs(Math.sin(p.stride * TAU)) * 0.012 * p.walk;
    out.rx = p.peck * 0.35;
  },
  head: (p, out) => {
    out.dz = Math.sin(p.stride * TAU) * 0.025 * p.walk;
    out.rx = p.headDown * 0.9 * p.peck + p.peck * 0.5;
  },
  leg_l: swing(1, 0.7),
  leg_r: swing(-1, 0.7),
  tail: (p, out) => {
    out.rx = -0.15 + Math.sin(p.time * 3 + p.seed * 5) * 0.05 + p.peck * 0.2;
  },
  wing_l: (p, out) => {
    out.rz = -(0.12 + Math.sin(p.flap * TAU) * 0.7 * p.flapAmt);
  },
  wing_r: (p, out) => {
    out.rz = 0.12 + Math.sin(p.flap * TAU) * 0.7 * p.flapAmt;
  },
};

/** Birds in flight: the wings beat about the shoulder, the body rocks with them, the tail steers. */
const BIRD: Record<string, RigFn> = {
  body: (p, out) => {
    out.dy = Math.sin(p.flap * TAU) * 0.012 * p.flapAmt;
    out.rx = Math.cos(p.flap * TAU) * 0.05 * p.flapAmt;
  },
  head: (p, out) => {
    out.rx = Math.sin(p.time * 5 + p.seed * 9) * 0.08 * (1 - p.flapAmt);
  },
  tail: (p, out) => {
    out.rx = Math.sin(p.flap * TAU + 1) * 0.1 * p.flapAmt;
  },
  wing_l: (p, out) => {
    out.rz = -(0.1 + Math.sin(p.flap * TAU) * 1.0 * p.flapAmt);
  },
  wing_r: (p, out) => {
    out.rz = 0.1 + Math.sin(p.flap * TAU) * 1.0 * p.flapAmt;
  },
};

/** The rig of each model key (`public/models/animals/<key>.glb`); see story-mechanics/PHASE_0_TODO.md for the part names. */
export const RIGS: Readonly<Record<string, Readonly<Record<string, RigFn>>>> = {
  sheep: SHEEP,
  chicken: CHICKEN,
  songbird: BIRD,
  dove: BIRD,
};

/** The pose of `part` of a `model`; false when the rig has nothing for it (the part stays at rest). */
export function posePart(model: string, part: string, pose: PoseParams, out: PartPose): boolean {
  const fn = RIGS[model]?.[part];
  out.rx = 0;
  out.ry = 0;
  out.rz = 0;
  out.dx = 0;
  out.dy = 0;
  out.dz = 0;
  if (!fn) return false;
  fn(pose, out);
  return true;
}
