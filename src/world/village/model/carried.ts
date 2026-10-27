// src/world/village/model/carried.ts — what the village shows the orb's hand carrying (pure types: no three)

/** What the village shows the hand carrying: a tree, or a sheaf of wheat (a sheep is the life system's). */
export type CarriedKind = 'tree' | 'wheat';

/** Where the hand holds what it carries: a tree's root (or a sheaf's base) at (x, y, z), a crown tipped back from the heading. */
export interface CarriedPose {
  x: number;
  y: number;
  z: number;
  /** The way the orb is heading (rad, about +y; 0 faces +z). The crown trails opposite. */
  yaw: number;
  /** Tilt back from upright (rad). */
  tilt: number;
  /** Size next to the thing standing. */
  scale: number;
}
