// src/config/village/hand.ts — village tunables: the orb's hand, which uproots, lifts and drops
// (story-mechanics/HAND.md; the numbers are placeholders until a playtest).

export const HAND_PARTS = {
  HAND: {
    /** Builder-seconds of work one wood hauled to a build site counts for. */
    WORK_PER_WOOD_S: 12,
    WHEAT: {
      /** A field can be harvested by the hand from this growth (0..1); the food is the yield times the growth. */
      MIN_RIPE: 0.9,
    },
  },
} as const;
