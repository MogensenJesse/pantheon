// src/config/phase0.ts — Phase 0 tunables (landmarks, whisper)
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
    LIGHT_DISTANCE_MIN: 6,
    LIGHT_DISTANCE_GAIN: 42,
    /** Pulse frequency for player orb scale. */
    PULSE_SPEED: 2.0,
  },
  /** Energy-driven sunrise + day ramp — see WorldReveal. */
  SKY_REVEAL: {
    NIGHT_SKY: VISUAL.sky.revealLighting.nightSky,
    SUN_INTENSITY_MAX: VISUAL.sky.revealLighting.sunIntensityMax,
    AMBIENT_MIN: VISUAL.sky.revealLighting.ambientMin,
    AMBIENT_MAX: VISUAL.sky.revealLighting.ambientMax,
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
    /** Map standing-stone id → memory-fragment id. */
    STONE_FRAGMENT_IDS: {
      0: 2,
      1: 5,
      2: 8,
      3: 12,
      4: 15,
    },
  },
  TERRAIN: {
    /** Night visibility boost from player point light on terrain splat. */
    PLAYER_GLOW_MUL: 0.42,
  },
  GRASS: {
    TILE_SIZE: 64,
    BLADES_PER_SIDE: VISUAL.grass.bladesPerSide,
  },
  STONE_DWELL_RADIUS: 3,
  STONE_DWELL_TIME: 1.5,
  TEMPLE_DWELL_RADIUS: 5,
  TEMPLE_DWELL_TIME: 1.5,
  LANDMARK_RADIUS_SQ: {
    oak: 16,
    spring: 16,
    templeApproach: 25,
    cairn: 16,
  },
  LANDMARK_ENERGY: {
    stone: 12,
    ancientOak: 8,
    sacredSpring: 15,
    drownedTemple: 20,
    highCairn: 10,
  },
  WHISPER_MIN_STONES: 3,
  AETHON_MEMORY_ID: 16,
  BLOOM: VISUAL.bloom,
  GODRAYS: VISUAL.godrays,
  RENDER: {
    TONE_MAPPING_EXPOSURE: VISUAL.render.toneMappingExposure,
  },
  TERRAIN_TEXTURE_REPEAT: VISUAL.terrain.textureRepeat,
  TERRAIN_SLOPE_ROCK_START: VISUAL.terrain.slopeRockStart,
  TERRAIN_DISPLACEMENT_SCALE: VISUAL.terrain.displacementScale,
  TERRAIN_NORMAL_STRENGTH: VISUAL.terrain.normalStrength,
  TERRAIN_AO_STRENGTH: VISUAL.terrain.aoStrength,
  TERRAIN_SPECULAR_STRENGTH: VISUAL.terrain.specularStrength,
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

/** Stone discovery prerequisites (spec: III after spring, V in temple). */
export const STONE_REQUIREMENTS: Partial<
  Record<number, { requiresSpring?: boolean; requiresTemple?: boolean }>
> = {
  2: { requiresSpring: true },
  4: { requiresTemple: true },
};
