// src/config/village/effects.ts — village tunables: what finished buildings and their levels do
// (story-mechanics/HAND.md; derived each step from the buildings, nothing here is saved; the numbers are
// placeholders until a playtest)

export const EFFECTS_PARTS = {
  EFFECTS: {
    /** A farmstead helps the fields around it: per level of each farmstead, up to the caps. */
    FARMSTEAD: {
      /** Fields whose middle is within this many metres of the farmstead feel it. */
      RADIUS_M: 70,
      /** Share of growth speed added per level (0.25 = a quarter faster) and food added to a harvest per level. */
      GROWTH_PER_LEVEL: 0.25,
      YIELD_PER_LEVEL: 1,
      /** Farmsteads stack, but never beyond these. */
      MAX_GROWTH_ADD: 1,
      MAX_YIELD_ADD: 4,
    },
    /** A shrine gives faith by itself: faith per second per level of each shrine, up to the cap. */
    SHRINE: {
      FAITH_PER_LEVEL: 0.03,
      MAX_FAITH_ADD: 0.3,
    },
    /** A workshop above level 1 speeds the woodcutters: share of chopping speed added per level above 1. */
    WORKSHOP: {
      CHOP_PER_LEVEL: 0.25,
      MAX_CHOP_ADD: 1,
    },
  },
} as const;
