// src/config/phase0.ts — Phase 0 tunables (orbs, reveal, whisper)
import { VISUAL } from './visualTuning';

export const PHASE0 = {
  ORB_COUNT: 26,
  /** Player energy cap (sunrise triggers when energy reaches this). */
  ENERGY_CAP: 100,
  /** Player movement, glow light, and pulse — see PlayerController + PlayerVisuals. */
  PLAYER: {
    BASE_SPEED: 6,
    /** Normalised height (worldY / WORLD.HEIGHT_SCALE). Above this → high-mountain slowdown. */
    BIOME_SLOWDOWN_HEIGHT_HIGH: 1.9,
    /** Below this height → low-shore slowdown band starts. */
    BIOME_SLOWDOWN_HEIGHT_LOW: 0.42,
    /** Upper bound of the low-shore slowdown band (exclusive). */
    BIOME_SLOWDOWN_HEIGHT_MID: 1.1,
    /** Speed multiplier when above BIOME_SLOWDOWN_HEIGHT_HIGH. */
    BIOME_SLOWDOWN_HIGH_MUL: 0.5,
    /** Speed multiplier when inside [HEIGHT_LOW, HEIGHT_MID). */
    BIOME_SLOWDOWN_LOW_MUL: 0.65,
    /** Half-world clamp fraction (margin from edge). */
    WORLD_CLAMP_MARGIN: 0.48,
    /** Player point light baseline + ratio gain (intensity = MIN + ratio * GAIN). */
    LIGHT_INTENSITY_MIN: 2.2,
    LIGHT_INTENSITY_GAIN: 5,
    /** Player point light baseline + ratio gain (distance = MIN + ratio * GAIN). */
    LIGHT_DISTANCE_MIN: 3,
    LIGHT_DISTANCE_GAIN: 10,
    /** Pulse frequency for player orb scale. */
    PULSE_SPEED: 2.0,
  },
  /** Elevation-driven sun / ambient / sky daylight (day cycle). */
  SKY_LIGHTING: {
    NIGHT_DAYLIGHT_FLOOR: VISUAL.sky.lightingCurve.nightDaylightFloor,
    SUN_INTENSITY_MAX: VISUAL.sky.lightingCurve.sunIntensityMax,
    AMBIENT_MIN: VISUAL.sky.lightingCurve.ambientMin,
    AMBIENT_MAX: VISUAL.sky.lightingCurve.ambientMax,
  },
  /** Story log timings and trigger thresholds — see StoryLog. */
  STORY: {
    /** Time a fragment is shown before fading out (ms). */
    QUEUE_INTERVAL_MS: 6000,
    /** Fade-out duration before the next fragment can appear (ms). */
    FADE_OUT_MS: 800,
    /** Energy-ratio thresholds and the fragment id to reveal at each. */
    ENERGY_THRESHOLDS: [
      { pct: 0.25, fragmentId: 3 },
      { pct: 0.5, fragmentId: 7 },
      { pct: 0.7, fragmentId: 10 },
      { pct: 0.85, fragmentId: 14 },
    ],
  },
  TERRAIN: {
    /** Night visibility boost from player point light on terrain splat. */
    PLAYER_GLOW_MUL: 0.42,
  },
  AETHON_MEMORY_ID: 16,
  BLOOM: VISUAL.bloom,
  GODRAYS: VISUAL.godrays,
  RENDER: {
    TONE_MAPPING_EXPOSURE: VISUAL.render.toneMappingExposure,
  },
  ORB: {
    PLAYER_RADIUS: 0.24,
    ENERGY_RADIUS: 0.22,
    /** Gap between the bottom of the sphere and the terrain surface. */
    GROUND_CLEARANCE: 0.28,
    BOB_AMPLITUDE: 0.12,
    BOB_SPEED: 2.0,
    /** Energy orb absorb radius in metres. */
    ABSORB_RADIUS: 1.5,
    /** Pre-squared absorb radius (avoid sqrt per orb per frame). */
    ABSORB_RADIUS_SQ: 1.5 * 1.5,
    /** Burst particle lifetime after absorption (seconds). */
    BURST_DURATION: 0.4,
    /** Inclusive lower bound for randomly-rolled orb energy value. */
    ENERGY_MIN: 3,
    /** Exclusive upper bound for randomly-rolled orb energy value. */
    ENERGY_MAX: 8,
    /** Pulse frequency for energy orb scale (rad/s). */
    PULSE_SPEED: 2.5,
    /** Pulse amplitude (added to PULSE_BASE → range [BASE - AMP, BASE + AMP]). */
    PULSE_AMPLITUDE: 0.15,
    /** Pulse base scale. */
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
    POSITION_SMOOTH: 8,
    LOOK_SMOOTH: 10,
    FOV: 52,
  },
} as const;
