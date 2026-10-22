// src/config/village/prayers.ts — village tunables: prayers (a believer voices a need, and it is answered or not)
// (story-mechanics/VILLAGE_INTERACTION.md; the numbers are placeholders until a playtest). Days are game days.

export const PRAYERS_PARTS = {
  PRAYERS: {
    /** Prayers open at once; more would be noise. */
    MAX_OPEN: 3,
    /** A need must have held this long (days) before someone prays for it. */
    NEED_DAYS: { food: 0.15, rain: 4, shelter: 0.4 },
    /** An unanswered prayer lapses after this many days: the villager loses their belief. */
    PATIENCE_DAYS: 1.5,
    /** Faith paid when a prayer is answered, whoever answered it. */
    ANSWER_FAITH: 4,
    /** Belief a villager is left with when their prayer lapses (below 1, so they no longer believe). */
    LAPSED_BELIEF: 0.5,
    /** Days with no open prayer before the lapsed believe again by themselves. */
    RECOVER_DAYS: 2,
    /** Rain (0..1) at or under which a day counts as dry, and at or over which a prayer for rain is answered. */
    DRY_BELOW: 0.05,
    RAIN_ANSWERS: 0.3,
  },
} as const;
