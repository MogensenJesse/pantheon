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
