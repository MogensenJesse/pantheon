// src/config/visual/player.ts — player orb illumination + footing smooth; surface glow muls live on terrain/grass/props

export const player = {
  illuminationNight: 0.2,
  illuminationDay: 0.02,
  /** Exponential smooth when the ring grows (orb absorbed). Higher = snappier. */
  illuminationGrowSmooth: 3.5,
  /** Exponential smooth when the ring shrinks (day fade / cap handoff). Lower = gentler. */
  illuminationShrinkSmooth: 1,
  /** Low-pass on macro terrain footing while moving (Hz). */
  orbFootingSmoothHz: 8,
} as const;
