// src/config/village/life.ts — village tunables: the people and what they build: the hamlet, construction, the villagers' day, fields, the well and the graveyard

export const LIFE = {
  /**
   * The village the game starts with: a finished hamlet that does not grow, bring newcomers or earn faith
   * until it is converted (the conversion quest ends with the elder believing).
   */
  HAMLET: {
    /** Houses standing at the start (the temple and the well are always there). */
    HOUSES: 3,
    FIELDS: 2,
    /** People at the start, including the priest who is the elder. */
    VILLAGERS: 11,
  },
  CONSTRUCTION: {
    /**
     * Builder-seconds of work per phase. A site appears as a foundation (stage 0): the first phase
     * raises the frame (stage 1), the second finishes the building (stage 2).
     */
    WORK_S: [300, 600],
    /** Builder-seconds of progress per second a builder works at a site. */
    BUILDER_RATE: 1,
    /** Extra work rate at full presence (0.5 = half again as fast). */
    PRESENCE_WORK_BOOST: 0.5,
    SLOTS_PER_SITE: 4,
  },
  VILLAGERS: {
    MAX: 200,
    /** Villagers at founding: a priest, two builders and an idler. */
    START: 4,
    /** Beds per finished building. */
    BEDS: { temple: 2, house_a: 3, house_b: 4, house_c: 5 } as Readonly<Record<string, number>>,
    /** Share of the population that builds; one priest per this many people. */
    BUILDER_SHARE: 0.5,
    PEOPLE_PER_PRIEST: 12,
    /**
     * Ambient workers, each only when the map has a workplace for them (trees near the village, a
     * shore inside its grid): share of the population, taken from the idlers.
     */
    WOODCUTTER_SHARE: 0.1,
    FISHERMAN_SHARE: 0.06,
    /** Where ambient workers stand: metres off the trunk (any tree in the village's reach can be felled). */
    WORK_SPOTS: { STAND_OFF_M: 1.1 },
    WALK_SPEED_MPS: 1.35,
    CARRY_SPEED_MPS: 1.1,
    /** Metres per full stride cycle (drives the walk animation phase, so feet do not slide). */
    STRIDE_M: 1.3,
    /** Seconds between a villager's decisions. */
    THINK_S: 0.3,
    /** Reached a waypoint within this distance (m). */
    ARRIVE_M: 0.5,
    /**
     * Phase 0 night (the sun never rises): share of builders who keep working by lantern and of
     * everyone else who prays instead of sleeping. At least one builder always works.
     */
    VIGIL: { BUILDER_WORK_SHARE: 0.5, PRAY_SHARE: 0.15 },
    /** Share of people who join the dawn and dusk prayers (priests always do). */
    DAWN_PRAY_SHARE: 0.3,
    DUSK_PRAY_SHARE: 0.4,
    PRAY_S: { MIN: 25, MAX: 70 },
    WANDER: { PAUSE_MIN_S: 4, PAUSE_MAX_S: 14, RADIUS_M: 40 },
    /**
     * The villagers' own timetable (day-cycle phases, 0 midnight, 0.25 sunrise, 0.75 sunset): wake, work
     * start/end, dusk end. Not the sun's: see PHASE0.DAY for sunset.
     */
    SCHEDULE: {
      WAKE: 0.22,
      WORK_START: 0.27,
      WORK_END: 0.68,
      DUSK_END: 0.76,
      /** The two meals: a villager who has not eaten yet goes to eat while their own clock is in a window. */
      MIDDAY_MEAL: [0.45, 0.5] as const,
      EVENING_MEAL: [0.7, 0.74] as const,
    },
    /** A meal: each takes this share of a person's daily food, and this long (s) at the table. */
    MEAL: {
      DAY_SHARE: 0.5,
      EAT_S: { MIN: 10, MAX: 16 },
      /** Further than this from their door (m) people eat where they are (a packed meal): a trip home would swallow the day's work. */
      HOME_MAX_M: 60,
    },
    /** Priests at the graves at dusk, standing this long (s). */
    MOURN_S: 60,
    /** Idlers keep to the plaza around the temple: a stroll goes at most this far (m) from it. */
    PLAZA_RADIUS_M: 24,
    /** Non-priests go home when rain reaches `ON` and come out again below `OFF`. */
    SHELTER: { RAIN_ON: 0.3, RAIN_OFF: 0.15 },
  },
  /** Fixed-step sim speed-up: sub-step size and cap (keeps A*, planner and rise-in stable). */
  TIME_SCALE: { MAX_SUBSTEP_S: 0.1, MAX_SUBSTEPS: 16 },
  FIELDS: {
    MAX: 6,
    /** One more field for every this many houses. */
    HOUSES_PER_FIELD: 3,
    /** Field footprint (m): rows run along the long side. */
    WIDTH_M: 10,
    DEPTH_M: 14,
    MAX_RELIEF_M: 1.2,
    /** Fields sit between these shares of the village radius. */
    MIN_RADIUS_SHARE: 0.4,
    MAX_RADIUS_SHARE: 0.85,
    COST: 8,
    /** Seconds for a planted field to ripen untended; farmers speed it up. */
    GROW_S: 900,
    /** Extra growth speed per farmer at work (up to 3 count). */
    TEND_BOOST: 0.5,
    /** Fields grow this much faster at full rain, linear in the rain. */
    RAIN_BOOST: 0.5,
    /** Share of the population that farms once a field exists. */
    FARMER_SHARE: 0.25,
    FENCE_SEGMENT_M: 2,
  },
  WELL: { HOUSES_NEEDED: 4, COST: 10 },
  /**
   * The graveyard: a plot picked at founding beyond the outer ring, away from houses, fields and the
   * main road, with a grave for every death in rows of plots.
   */
  GRAVEYARD: {
    /** The reserved plot (m): along its local x by z. */
    WIDTH_M: 12,
    DEPTH_M: 8,
    /** Spacing between graves (m). */
    PLOT_M: 2,
    /** Wanted distance from buildings and fields (m), and from the roads beyond their clearance. */
    CLEAR_M: 12,
    MAX_RELIEF_M: 1.0,
    /** Rows added beyond the plot when it fills up. */
    EXTRA_ROWS: 12,
  },
} as const;
