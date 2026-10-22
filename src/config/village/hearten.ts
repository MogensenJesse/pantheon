// src/config/village/hearten.ts — village tunables: Hearten, a touch on one villager
// (story-mechanics/VILLAGE_INTERACTION.md; the numbers are placeholders until a playtest). Days are game days.

export const HEARTEN_PARTS = {
  HEARTEN: {
    /** Faith the touch costs. */
    FAITH: 3,
    /** How long the villager is lifted (days), and the work rate they have while they are. */
    DURATION_DAYS: 0.5,
    BOOST: 1.5,
    /** The same villager cannot be touched again for this long (days, counted from the touch). */
    COOLDOWN_DAYS: 1,
  },
} as const;
