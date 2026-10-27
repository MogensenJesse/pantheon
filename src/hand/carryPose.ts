// src/hand/carryPose.ts — where a carried tree hangs from the orb (pure: no three, node-runnable)
//
// The root hangs just under the orb and the crown trails behind the way the orb is going. The heading follows
// the orb's movement and stays put when the orb stops, so a hovering orb does not spin its tree.

import { hand } from '../config/visual/hand.ts';
import { turnToward } from '../core/math/scalar.ts';
import type { CarriedPose } from '../world/village/model/carried.ts';
import type { HandKind } from './handTypes.ts';

const C = hand.CARRY;

export interface CarryHeading {
  /** Follows the orb's movement this frame; returns the heading. */
  update: (dt: number, x: number, z: number) => number;
  heading: () => number;
  /** Start again from a place (a new lift), facing `heading`. */
  reset: (x: number, z: number, heading?: number) => void;
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
        heading = turnToward(heading, Math.atan2(dx, dz), follow);
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

/** The pose of a carried tree, sheaf or sheep for an orb at (x, y, z) heading `heading`. */
export function carryPoseOf(
  kind: HandKind,
  orb: { x: number; y: number; z: number },
  heading: number,
): CarriedPose {
  if (kind === 'tree') {
    return {
      x: orb.x,
      y: orb.y - C.HANG_M,
      z: orb.z,
      yaw: heading,
      tilt: C.TILT_RAD,
      scale: C.TREE_SCALE,
    };
  }
  if (kind === 'sheep') {
    // The sheep dangles upright with its feet below the orb.
    return {
      x: orb.x,
      y: orb.y - C.SHEEP_DROP_M,
      z: orb.z,
      yaw: heading,
      tilt: 0,
      scale: C.SHEEP_SCALE,
    };
  }
  // The sheaf hangs level under the orb, lengthways along the way it is going.
  return {
    x: orb.x,
    y: orb.y - C.SHEAF_DROP_M,
    z: orb.z,
    yaw: heading,
    tilt: 0,
    scale: C.SHEAF_SCALE,
  };
}
