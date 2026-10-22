// src/config/visual/rune.ts — the player's rune: five strokes, one for each place of power
//
// PLACEHOLDER shape (a spine with two branches either side), drawn in the memory book now and in the sky above
// the temple at the end of the story. Points are in a box from -1 to 1, x to the right and y up; a stroke
// lights when its place is restored. The author owns the real design (story-mechanics/PHASE_0_TODO.md).

import type { LandmarkKind } from '../../map/MapTypes.ts';

export type RuneStroke = readonly [x0: number, y0: number, x1: number, y1: number];

export const RUNE_STROKES: Readonly<Record<LandmarkKind, RuneStroke>> = {
  runestones: [0, -1, 0, 1],
  tree: [0, 1, 0.7, 0.4],
  temple_ruin: [0, 0.1, 0.7, -0.5],
  sunken_ruin: [0, 1, -0.7, 0.4],
  monolith: [0, 0.1, -0.7, -0.5],
};
