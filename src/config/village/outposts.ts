// src/config/village/outposts.ts — village tunables: outposts (a crew camps beyond the village and builds a camp that
// keeps supplying it) (story-mechanics/VILLAGE_INTERACTION.md; the numbers are placeholders until a playtest)

export const OUTPOSTS_PARTS = {
  OUTPOSTS: {
    /** Outposts at once, built or being built. */
    MAX: 3,
    /** Wood and faith taken when the crew sets out. */
    WOOD: 20,
    FAITH: 8,
    /** Builder-seconds of work per stage (two stages, like a building). */
    SITE_WORK_S: [300, 600],
    /** What a finished outpost delivers per second, until the stores are full. */
    WOOD_PER_SEC: 0.01,
    FOOD_PER_SEC: 0.008,
    /** A lumber camp needs this many standing trees within `RESOURCE_RADIUS_M`; a fishing hut needs water that close. */
    MIN_TREES: 6,
    RESOURCE_RADIUS_M: 30,
    /** Outposts keep this far apart, and this far beyond the village's edge (m). */
    MIN_APART_M: 60,
    MIN_OUTSIDE_M: 10,
  },
} as const;
