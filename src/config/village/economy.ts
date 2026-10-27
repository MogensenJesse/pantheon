// src/config/village/economy.ts — village tunables: faith, wood and food: the stores, the forest and hunger

import { GAME_DAY_S } from '../clock.ts';

export const ECONOMY_PARTS = {
  /** Faith: the village currency; the orb's presence speeds it up (Phase 1 onward). */
  FAITH: {
    START: 12,
    /** Faith per second with nobody around (the sandbox village; a hamlet earns from believers). */
    BASE_PER_SEC: 0.08,
    /** Faith per second for each villager who believes (a hamlet's only income, before the orb's presence). */
    PER_BELIEVER_PER_SEC: 0.015,
    /** Faith rate multiple at full presence. */
    PRESENCE_MUL: 3.5,
    /** Presence ramps up over this long while the orb is near (s). */
    DWELL_UP_S: 20,
    DWELL_DOWN_S: 10,
    /** Full presence inside this distance, fading to none at PRESENCE_RADIUS_M (m). */
    FULL_RADIUS_M: 30,
    PRESENCE_RADIUS_M: 80,
    SITE_COST: 12,
    /** Faith a newcomer costs; they arrive while the village has free beds. */
    VILLAGER_COST: 2,
    /** Each building raises the next site cost by this fraction of the base cost. */
    SITE_COST_GROWTH: 0.005,
  },
  /**
   * Wood and food. Woodcutters and fishermen make them while they stand at a tree or the shore,
   * fields give food when a tended, ripe field is harvested, everyone eats, and buildings cost wood.
   * Building sites also need housing pressure: they start when beds run short.
   */
  ECONOMY: {
    /** Seconds in a game day (`config/clock.ts`, which the sky's day cycle uses too). */
    DAY_S: GAME_DAY_S,
    /** Food each villager eats per game day. */
    FOOD_PER_PERSON_DAY: 1,
    /** Food a harvested field gives. */
    FIELD_YIELD: 5,
    /** Food a fisherman brings in per second at the shore. */
    FISH_PER_SEC: 1 / 100,
    /** What the village can hold with no storage building, of each. */
    BASE_CAP: 40,
    /** Added by each finished granary (food) and workshop (wood). */
    GRANARY_FOOD_CAP: 60,
    WORKSHOP_WOOD_CAP: 60,
    /** What a village starts with. */
    START: { wood: 30, food: 24 },
    /** Wood a building costs to start (the temple and the well are not built through sites). */
    WOOD_COST: {
      house_a: 10,
      house_b: 14,
      house_c: 18,
      workshop: 20,
      granary: 20,
      farmstead: 12,
      shrine: 14,
    } as Readonly<Record<string, number>>,
    /**
     * A site starts only while the free beds (counting beds in sites under construction) are below
     * this share of all beds, and the number of sites that may be open at once rises to
     * `PRESSED_MAX_SITES` when they are below `PRESSED_SHARE`.
     */
    PRESSURE_SHARE: 0.15,
    PRESSED_SHARE: 0.05,
    PRESSED_MAX_SITES: 5,
  },
  /**
   * The forest: woodcutters fell trees for a limited yield, a tree falls, leaves a stump, and grows
   * back from a sapling. Times are game days (`ECONOMY.DAY_S`) unless they end in `_S`.
   */
  FOREST: {
    /** Wood a standing tree gives (before its scale), by key: the exact key, else the family before the number. */
    YIELD: {
      fir: 6,
      birch: 5,
      pine_sapling: 1,
      pine_small: 3,
      pine_medium: 5,
      pine_large: 7,
      pine_big: 9,
    } as Readonly<Record<string, number>>,
    DEFAULT_YIELD: 5,
    /** Seconds of chopping per wood of yield (a 6-wood tree takes 2.5 minutes). */
    CHOP_S_PER_WOOD: 25,
    /** The fall, in seconds (the view plays it). */
    FALL_S: 2.5,
    /** A stump waits this long, then a sapling grows from `SAPLING_START` to full size over `GROW_DAYS`. */
    REGROW_DAYS: 3,
    GROW_DAYS: 2,
    SAPLING_START: 0.1,
    /** Saplings growing at once. */
    MAX_SAPLINGS: 40,
    /** Growth speed gained per unit of rain (0..1). */
    RAIN_BOOST: 1,
  },
  /**
   * Hunger and death. Food at zero for `STARVE_GRACE_DAYS` makes everyone weak; after another
   * `DEATH_AFTER_DAYS` one villager dies, then one more every `DEATH_INTERVAL_DAYS` while the larder
   * stays empty. Days are game days (`ECONOMY.DAY_S`).
   */
  HUNGER: {
    STARVE_GRACE_DAYS: 2,
    DEATH_AFTER_DAYS: 1,
    DEATH_INTERVAL_DAYS: 0.5,
    /** Once food is back, the build-up of hunger drains over this long (weakness ends part-way through). */
    RECOVERY_DAYS: 0.5,
    /** Weak villagers walk at this share of their speed; builders and woodcutters do not work at all, food gatherers carry on. */
    WEAK_MUL: 0.5,
    /** Faith a death costs (never below zero). */
    DEATH_FAITH_COST: 5,
    /** The collapse, then the body sinking away, in seconds. */
    COLLAPSE_S: 2,
    FADE_S: 3,
  },
} as const;
