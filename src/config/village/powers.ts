// src/config/village/powers.ts — village tunables: arch II of the skill tree: when it opens and the powers it gives

export const POWERS = {
  /**
   * Arch II of the skill tree, The Village (M9): it opens in a converted village once this much faith has been
   * earned (faith earned, not in the store), with a few sparks; every further milestone of faith earned gives one more.
   */
  ARCH_II: {
    OPEN_FAITH_EARNED: 150,
    OPEN_SPARKS: 3,
    MILESTONE_FAITH: 300,
  },
  /**
   * The builder powers of arch II (M9), cast from the orb cursor in the overview. Faith costs against an income of
   * about 0.5 faith per second; cooldowns and durations are seconds of game time.
   */
  BUILDER_POWERS: {
    /** A field, a house (its residents work) or a tree (chopped and grown faster) for a while. */
    BLESSING: { FAITH: 20, COOLDOWN_S: 120, SECONDS: 180, BOOST: 1.5 },
    /** The current stage of a construction site is done at once. */
    KINDLE: { FAITH: 15, COOLDOWN_S: 60 },
    /** Food appears in the larder. */
    PROVIDE: { FAITH: 30, COOLDOWN_S: 600, FOOD: 15 },
    /** A storm front centred on the cursor. */
    CALL_RAIN: { FAITH: 40, COOLDOWN_S: 900, RADIUS_M: 700, SPEED_MUL: 0.4, PEAK: 1 },
    /** The weather is parted around the cursor for a while. */
    CLEAR_SKIES: { FAITH: 25, COOLDOWN_S: 600, RADIUS_M: 1200, SECONDS: 600 },
    /** How far from the cursor's ground point a tree (Blessing) or a construction site (Kindle) still counts as aimed at (m). */
    AIM_M: { TREE: 6, SITE: 10 },
  },
} as const;
