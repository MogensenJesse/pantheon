// src/config/phase0.ts — Phase 0 gameplay tunables

export const PHASE0 = {
  /** Energy cap: the bar is full at 100 (the sunrise also needs every landmark awake). */
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
  /** Shown once when the bar is full but landmarks are still dormant. */
  UNFINISHED_MEMORY_ID: 17,
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
  /**
   * The five landmarks (story-mechanics/PHASE_0_LANDMARKS.md). The sunrise needs the energy at the cap and
   * every landmark of the map awake.
   */
  LANDMARK: {
    /** The orb wakes a landmark by standing within this distance (m) of it... */
    RADIUS_M: 8,
    /** ...for this long (s); leaving resets the count. */
    DWELL_S: 4,
    /** Energy each landmark gives when it wakes. */
    ENERGY: 14,
    /** The guide line ends this far (m) above the ground at a landmark. */
    GUIDE_END_HEIGHT_M: 1.5,
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
  /** The conversion quest. */
  QUEST: {
    /** The elder notices the orb within this distance (m) while he prays. */
    ELDER_MEET_M: 6,
    /** How long he stands and looks at the orb when they meet (s). */
    ELDER_MEET_HOLD_S: 10,
    /** Villagers who must believe for the "help the village believe" step. */
    CONVERTS_GOAL: 5,
    /** A Sign counts as lighting the temple fire within this distance (m) of the temple... */
    FIRE_TEMPLE_M: 15,
    /** ...at dusk: this much of the day before sunset, until this much after it. */
    DUSK_BEFORE_SUNSET: 0.13,
    DUSK_AFTER_SUNSET: 0.05,
    /** The offering: stand within this distance (m) of the temple with at least `OFFERING_MIN_ENERGY`... */
    OFFERING_TEMPLE_M: 8,
    OFFERING_MIN_ENERGY: 50,
    /** ...and `OFFERING_GOAL` energy flows into it, `OFFERING_PER_SEC` per second. */
    OFFERING_GOAL: 40,
    OFFERING_PER_SEC: 4,
    /** After the meeting the elder's pip shows within this distance (m) of the orb. */
    ELDER_PIP_RANGE_M: 40,
    /** A teaching quest about the village's size begins at this many villagers. */
    MANY_HANDS_FROM: 15,
    /** Teaching quests open at once (the elder does not pile on; the rest wait their turn). */
    MAX_TEACHING_OPEN: 3,
    /** Seconds between the quests' own looks at the world (events also trigger one). */
    TICK_S: 0.25,
    /** Rewards for converting the village: a spark for each convert past this many... */
    SPARKS_AFTER_CONVERTS: 5,
    /** ...and this many when the village converts. */
    SPARKS_AT_CONVERSION: 3,
    /** The last night, when the name returns (placeholder numbers until a playtest). */
    FINALE: {
      /** The share of the village that must believe and stand this close (m) to the temple at dusk. */
      GATHER_SHARE: 0.6,
      TEMPLE_R_M: 15,
      /** The orb stands within this distance (m) of the temple with at least this much energy (as the offering asks). */
      TEMPLE_M: 8,
      MIN_ENERGY: 50,
      /** Sparks paid when the name has returned. */
      SPARKS: 4,
      /** The cutscene (s unless said): the opening look at the gathering, then a slot for each place... */
      CUTSCENE: {
        INTRO_S: 3,
        PLACE_S: 4.5,
        /** ...in which the view glides to the place, a beam rises there and, a moment later, a stroke of the rune lights. */
        GLIDE_S: 1.5,
        BEAM_AT_S: 1,
        BEAM_RISE_S: 1.8,
        /** The view drifts round what it looks at (rad/s): in the opening and in each place's slot. */
        INTRO_DRIFT: 0.04,
        PLACE_DRIFT: 0.05,
        /** The strokes of the rune light in the return shot: from this share of it, one after another, each fading in over STROKE_FADE_S. */
        STROKES_AT: 0.35,
        STROKE_STAGGER_S: 0.5,
        STROKE_FADE_S: 0.8,
        /** The rune's glow when the first stroke starts (it rises to full once the last is lit). */
        GLOW_BASE: 0.6,
        /** Then the view returns to the temple and looks up at the rune, which glows and holds. */
        RETURN_S: 3.5,
        HOLD_S: 4,
        /** The camera: distance (m), pitch (rad up from level) and the height it looks at above the ground (m). */
        PLACE: { DISTANCE_M: 38, PITCH: 0.3, LOOK_M: 6 },
        TEMPLE: { DISTANCE_M: 34, PITCH: 0.3, LOOK_M: 5 },
        SKY: { DISTANCE_M: 130, PITCH: 0.12 },
        /** The rune hangs this high above the temple (m) and is this tall (m). */
        RUNE_HEIGHT_M: 190,
        RUNE_SIZE_M: 80,
        /** After the finale: the share of full strength the beams and the rune keep. */
        BEAM_SETTLED: 0.18,
        RUNE_SETTLED: 0.35,
      },
    },
  },
  /** The conversion powers. */
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
  /** The day cycle's phases (0..1) where the sun goes down and comes up again. */
  DAY: {
    SUNRISE: 0.25,
    SUNSET: 0.75,
  },
  /** Orb respawn once the skill tree has opened. */
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
  /** The village overview: the camera lifts above the village and the orb becomes a cursor. */
  OVERVIEW: {
    /** `B` starts it within this distance (m) of the temple's footprint. */
    REACH_M: 14,
    /** Fixed camera pitch above the ground (degrees). */
    PITCH_DEG: 55,
    /** Camera distance from what it looks at (m): nearest, where it starts, farthest. */
    DISTANCE_MIN_M: 25,
    DISTANCE_START_M: 80,
    DISTANCE_MAX_M: 220,
    /** The camera may look this far (m) beyond the village's radius. */
    MARGIN_M: 40,
    /** The move in and out of it (s). */
    TRANSITION_S: 0.8,
    /** Keyboard panning: metres per second for each metre of camera distance. */
    PAN_PER_DISTANCE: 0.9,
    /** Radians of turn per pixel of right-button drag. */
    ROTATE_PER_PX: 0.005,
    /** The wheel: distance multiplies by exp(deltaY * this). */
    ZOOM_PER_DELTA: 0.0012,
    /** How fast the distance and the orb cursor follow what you asked for (per second). */
    ZOOM_SMOOTH: 10,
    CURSOR_SMOOTH: 16,
    /** The orb cursor grows with the camera distance so it stays visible: scale = max(1, distance * this). */
    CURSOR_SCALE_PER_M: 0.07,
    /** How far above the ground the orb cursor floats, before its scale (m). */
    CURSOR_HOVER_M: 0.9,
    /** Leaving: how fast the camera's catch-up offset from entering dies away (per second). */
    OFFSET_FADE_PER_S: 6,
    /** A left press that moves less than this (px) is a click, not a grab. */
    CLICK_SLOP_PX: 4,
    /** The mouse ray that finds the ground point under the cursor: how far it reaches and its first step (m). */
    RAY_MAX_M: 700,
    RAY_STEP_M: 4,
    /** How fast `focusOn` closes in on its point (per second). */
    GOAL_SMOOTH: 5,
    /** Bed dots show when the camera is closer than this (m), so a wide view stays quiet, and at most this many. */
    PIPS_MAX_DISTANCE_M: 120,
    PIPS_MAX: 80,
    /** The reach assumed for a village with no authored seed (m). */
    FALLBACK_VILLAGE_RADIUS_M: 160,
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
