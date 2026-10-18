// src/config/phase0.ts — Phase 0 gameplay tunables

export const PHASE0 = {
  /** Energy cap — sunrise at 100%. */
  ENERGY_CAP: 100,
  PLAYER: {
    BASE_SPEED: 6,
    /** When worldY / HEIGHT_SCALE > HILLS.max. */
    BIOME_SLOWDOWN_HIGH_MUL: 0.5,
    /** Inside [SHORE.max, FOREST.max). */
    BIOME_SLOWDOWN_LOW_MUL: 0.65,
    WORLD_CLAMP_MARGIN: 0.48,
    /** Point light: intensity = MIN + ratio × GAIN. */
    LIGHT_INTENSITY_MIN: 2.2,
    LIGHT_INTENSITY_GAIN: 5,
    LIGHT_DISTANCE_MIN: 3,
    LIGHT_DISTANCE_GAIN: 10,
    PULSE_SPEED: 2.0,
    /** Exponential velocity ease — higher = snappier. */
    MOVEMENT_ACCEL_SMOOTH: 3,
    MOVEMENT_DECEL_SMOOTH: 3,
  },
  STORY: {
    QUEUE_INTERVAL_MS: 6000,
    FADE_OUT_MS: 800,
    ENERGY_THRESHOLDS: [
      { pct: 0.25, fragmentId: 3 },
      { pct: 0.5, fragmentId: 7 },
      { pct: 0.7, fragmentId: 10 },
      { pct: 0.85, fragmentId: 14 },
    ],
  },
  AETHON_MEMORY_ID: 16,
  ORB: {
    PLAYER_RADIUS: 0.24,
    ENERGY_RADIUS: 0.14,
    GROUND_CLEARANCE: 0.28,
    BOB_AMPLITUDE: 0.12,
    BOB_SPEED: 2.0,
    /** Pre-squared absorb radius. */
    ABSORB_RADIUS_SQ: 1.5 * 1.5,
    RNG_SEED: 'aethon-world-1',
    ENERGY_MIN: 3,
    ENERGY_MAX: 8,
    PULSE_SPEED: 2.5,
    PULSE_AMPLITUDE: 0.15,
    PULSE_BASE: 0.85,
  },
  /** Shrines: stone circles where energy returns once Attunement is taken (see skills/skillTree.ts). */
  SHRINE: {
    /** Zone radius (m) when the map entity gives none. */
    RADIUS_M: 12,
    MIN_RADIUS_M: 3,
    MAX_RADIUS_M: 80,
    /** Energy per second inside the zone when the map entity gives none. */
    REGEN_PER_SEC: 0.5,
  },
  /** The conversion quest (first numbers, tunable). */
  QUEST: {
    /** The elder notices the orb within this distance (m) while he prays. */
    ELDER_MEET_M: 6,
    /** How long he stands and looks at the orb when they meet (s). */
    ELDER_MEET_HOLD_S: 10,
    /** Villagers who must believe for the "help the village believe" step. */
    CONVERTS_GOAL: 5,
    /** A Sign counts as lighting the temple fire within this distance (m) of the temple... */
    FIRE_TEMPLE_M: 15,
    /** ...at dusk: day-cycle phases (0.75 is sunset). */
    DUSK_FROM: 0.62,
    DUSK_TO: 0.8,
    /** The offering: stand within this distance (m) of the temple with at least `OFFERING_MIN_ENERGY`... */
    OFFERING_TEMPLE_M: 8,
    OFFERING_MIN_ENERGY: 50,
    /** ...and 40 energy flows into it, this much per second. */
    OFFERING_GOAL: 40,
    OFFERING_PER_SEC: 4,
    /** After the meeting the elder's pip shows within this distance (m) of the orb. */
    ELDER_PIP_RANGE_M: 40,
    /** Rewards for converting the village: a spark for each convert past this many... */
    SPARKS_AFTER_CONVERTS: 5,
    /** ...and this many when the village converts. */
    SPARKS_AT_CONVERSION: 3,
  },
  /** The conversion powers (first numbers, tunable). */
  POWERS: {
    /** Belief pips show above villagers within this distance (m) of the orb. */
    PIP_RANGE_M: 15,
    MURMUR: {
      /** The orb must stay within this distance (m) of the villager. */
      RANGE_M: 6,
      /** Seconds of murmuring that take a villager from 0 to full belief; also the longest channel. */
      SECONDS: 20,
      DRAIN_PER_SEC: 1,
      /** The villager stays where they are, looking at the orb, a moment after each step of the channel. */
      HOLD_S: 0.6,
    },
    DREAM: {
      COST: 8,
      /** The house must stand within this distance (m) of the orb. */
      RANGE_M: 14,
      /** Belief each sleeper in the house gains. */
      BELIEF: 0.35,
    },
    SIGN: {
      COST: 12,
      COOLDOWN_SEC: 30,
      /** Villagers outdoors within this distance (m) see it. */
      RANGE_M: 25,
      BELIEF: 0.3,
      /** Those who see it stop and look at the orb for this long (s). */
      NOTICE_S: 4,
      /** The sparkles burst this high (m) above the orb's position. */
      SPARKLE_HEIGHT_M: 1.2,
    },
  },
  /** Orb respawn once the skill tree has opened (first numbers, tunable). */
  RESPAWN: {
    INTERVAL_SEC: 240,
    /** No respawn while this many orbs are alive. */
    MAX_LIVE: 12,
    MIN_PLAYER_DIST_M: 40,
    MIN_ORB_DIST_M: 25,
    /** Chance that a respawn is placed near a shrine (when the map has one). */
    SHRINE_BIAS: 0.5,
    SHRINE_MIN_M: 30,
    SHRINE_MAX_M: 120,
    /** Tries to find a fitting spot before giving up until the next interval. */
    MAX_TRIES: 40,
  },
  /** Where an orb may come back (see entities/energyOrb/respawn.ts for when). */
  RESPAWN_PLACE: {
    /** Stay inside this share of the player's walkable half-extent. */
    EDGE_SHARE: 0.98,
    /** At least this far (m) above the water... */
    WATER_CLEARANCE_M: 1.5,
    /** ...on ground at least this level (surface normal y)... */
    MIN_NORMAL_Y: 0.9,
    /** ...and this far (m) outside the village's own radius. */
    VILLAGE_CLEARANCE_M: 15,
  },
  /** "Press E to save" at the temple. */
  TEMPLE_SAVE: {
    /** The hint shows within this distance (m) of the temple's footprint. */
    REACH_M: 14,
  },
  CAMERA: {
    DISTANCE: 5.5,
    LOOK_HEIGHT: 1.2,
    INITIAL_YAW: 0,
    INITIAL_PITCH: 0.42,
    PITCH_MIN: 0.15,
    PITCH_MAX: 1.15,
    YAW_SENSITIVITY: 0.0022,
    PITCH_SENSITIVITY: 0.002,
    POSITION_SMOOTH: 5,
    LOOK_SMOOTH: 10,
    FOV: 52,
  },
} as const;
