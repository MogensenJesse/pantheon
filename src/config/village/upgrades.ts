// src/config/village/upgrades.ts — village tunables: building upgrade levels
// (story-mechanics/VILLAGE_INTERACTION.md; the numbers are placeholders until a playtest)

export const UPGRADES_PARTS = {
  UPGRADES: {
    MAX_LEVEL: 3,
    /** Builder-seconds of work to reach level 2 and level 3. */
    WORK_S: [240, 480],
    /** Wood to reach level 2 and 3, as a share of the building's base wood cost. */
    WOOD_SHARE: [0.8, 1.4],
    /** Faith to reach level 2 and 3. */
    FAITH: [10, 24],
    /** Upgrades under way at once. */
    MAX_ACTIVE: 2,
    /** Beds a house gains for each level above 1. */
    BEDS_PER_LEVEL: 1,
    /** Share of its base capacity a granary or workshop gains for each level above 1. */
    STORE_CAP_SHARE: 0.5,
  },
} as const;
