// src/config/village/restoration.ts — village tunables: restoring the five places of power
// (story-mechanics/PHASE_2_RESTORATION.md has the design; the numbers are placeholders until a playtest)

export const RESTORATION_PARTS = {
  RESTORATION: {
    /** Faith paid when a place is restored (the hurdle lifts and the boon applies as well). */
    RESTORE_FAITH: 120,
    /** Wood taken from the store when a restoration starts. */
    START_WOOD: 40,
    /** Builder-seconds of work per stage of a remote site (two stages, like a building). */
    SITE_WORK_S: [600, 1200],
    /** The crew that camps at the site: at least this many builders must be free to start, at most this many go. */
    CREW: { MIN: 2, MAX: 4 },
    /** A place is only offered when the walk from the temple takes at most this long (minutes). */
    ROUTE_WALK_LIMIT_MIN: 20,
  },
} as const;
