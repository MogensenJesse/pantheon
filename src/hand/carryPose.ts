// src/hand/carryPose.ts — where a carried tree hangs from the orb (pure: no three, node-runnable)
//
// The root hangs just under the orb and the crown trails behind the way the orb is going. The heading follows
// the orb's movement and stays put when the orb stops, so a hovering orb does not spin its tree.

import { VILLAGE } from '../config/village.ts';

const C = VILLAGE.HAND.CARRY;

export interface CarryPose {
  x: number;
  y: number;
  z: number;
  /** The way the orb is heading (rad, about +y; 0 faces +z). The crown trails opposite. */
  yaw: number;
  /** Tilt back from upright (rad). */
  tilt: number;
  /** Size next to the tree standing. */
  scale: number;
}

export interface CarryHeading {
  /** Follows the orb's movement this frame; returns the heading. */
  update: (dt: number, x: number, z: number) => number;
  heading: () => number;
  /** Start again from a place (a new lift), facing `heading`. */
  reset: (x: number, z: number, heading?: number) => void;
}

const TWO_PI = Math.PI * 2;

/** The shortest signed turn (rad) from `from` to `to`. */
export function turnBetween(from: number, to: number): number {
  return ((((to - from) % TWO_PI) + 3 * Math.PI) % TWO_PI) - Math.PI;
}

export function createCarryHeading(): CarryHeading {
  let heading = 0;
  let lastX = 0;
  let lastZ = 0;
  let fresh = true;
  return {
    update: (dt, x, z) => {
      if (fresh) {
        lastX = x;
        lastZ = z;
        fresh = false;
      }
      const dx = x - lastX;
      const dz = z - lastZ;
      lastX = x;
      lastZ = z;
      if (Math.hypot(dx, dz) >= C.MIN_MOVE_M) {
        const follow = 1 - Math.exp(-C.TURN_PER_S * Math.max(0, dt));
        heading += turnBetween(heading, Math.atan2(dx, dz)) * follow;
      }
      return heading;
    },
    heading: () => heading,
    reset: (x, z, h = 0) => {
      heading = h;
      lastX = x;
      lastZ = z;
      fresh = false;
    },
  };
}

/** The pose of a carried tree for an orb at (x, y, z) heading `heading`. */
export function carryPoseOf(orb: { x: number; y: number; z: number }, heading: number): CarryPose {
  return {
    x: orb.x,
    y: orb.y - C.HANG_M,
    z: orb.z,
    yaw: heading,
    tilt: C.TILT_RAD,
    scale: C.TREE_SCALE,
  };
}
