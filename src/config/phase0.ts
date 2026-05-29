// src/config/phase0.ts — Phase 0 tunables (scatter, landmarks, whisper)
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
    /** Starting daylight at the beginning of the night (0..1). */
    NIGHT_SKY: 0.12,
    /** Sun intensity at full reveal (used by WorldReveal + grass material). */
    SUN_INTENSITY_MAX: 1.6,
    /** Ambient light at full night. */
    AMBIENT_MIN: 0.04,
    /** Ambient light at full day. */
    AMBIENT_MAX: 0.9,
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
  SCATTER: {
    TREE_PATH_COUNT: 55,
    TREE_OPEN_COUNT: 18,
    TREE_FOREST_COUNT: 55,
    FOREST_UNDERSTORY_COUNT: 90,
    HILL_ROCKS_COUNT: 50,
    SHORE_PLANTS_COUNT: 50,
    MOUNTAIN_ROCKS_COUNT: 50,
    GRASS_COVER_COUNT: 10000,
    GRASS_ACCENT_COUNT: 350,
  },
  /** Poly Haven grass_medium_01 — instanced GLB clumps + node material (wind + glow) */
  GRASS: {
    /** Hide grass instanced chunks farther than this from the player (metres). */
    DISTANCE_CUT: 72,
    /** Spatial chunk size for grass distance culling (metres). */
    CULL_CELL_SIZE: 40,
    ALPHA_TEST: 0.15,
    WIND_STRENGTH: 0.18,
    WIND_SPEED: 0.6,
    WIND_NOISE_SCALE: 0.12,
    SURFACE_LIFT: 0.02,
    /** Night visibility from player point light (0 = only in glow). */
    PLAYER_GLOW_MUL: 0.42,
    /** Albedo boost applied with visibility (day + night in glow). */
    COLOR_BOOST: { r: 2.4, g: 2.8, b: 2.2 },
    /**
     * Per-biome instance budget (countShare, sum ≈ 1) and spacing multiplier.
     * Lower countShare + higher spacingMul = fewer clumps per m² on that biome.
     */
    BIOME_SCATTER: {
      shore: { countShare: 0.06, spacingMul: 3.5 },
      forest: { countShare: 0.76, spacingMul: 0.65 },
      hills: { countShare: 0.14, spacingMul: 1.15 },
      mountain: { countShare: 0.04, spacingMul: 2.4 },
    },
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
  BLOOM: {
    SMOOTH_WIDTH: 0.045,
    STRENGTH: 0.2,
    STRENGTH_HIGH: 1.45,
    RADIUS: 1,
    RADIUS_HIGH: 0.48,
    SCENE_THRESHOLD: 0.96,
    SCENE_STRENGTH_MUL: 0.38,
    /** Far-plane depth (SkyMesh): attenuate bloom bleed on sky, not nearby geometry. */
    SKY_DEPTH_START: 0.992,
    SKY_DEPTH_END: 0.9995,
    /** HDR sun disc on sky — keep local bloom (far depth would otherwise zero it). */
    SKY_SUN_LUMA_START: 0.92,
    SKY_SUN_LUMA_END: 1.15,
    /** Max bloom cut on sky pixels (0–1). */
    SKY_REDUCE: 0.85,
    HDR_SCALE: 4.25,
    PLAYER_EMISSIVE: 1.25,
    RESOLUTION_SCALE_HIGH: 1.0,
  },
  /** Volumetric god rays — GodraysNode + bilateral blur + depthAwareBlend (three.js official path). */
  GODRAYS: {
    DENSITY_BASE: 1,
    MAX_DENSITY_BASE: 0.4,
    INTENSITY_MUL: 0.48,
    WEIGHT_MIN: 0.35,
    WEIGHT_MAX: 1,
    BLUR_SIGMA: 4,
    BLUR_SIGMA_COLOR: 0.12,
    EDGE_RADIUS: 2,
    EDGE_STRENGTH: 2,
    TINT_R: 1.08,
    TINT_G: 0.96,
    TINT_B: 0.82,
    SKY_LUMA_START: 0.82,
    SKY_LUMA_END: 1.05,
    /** viewDir·sunDir fade — cuts antisolar convergence opposite the sun. */
    SUN_FACING_MIN: -0.05,
    SUN_FACING_MAX: 0.35,
    SUN_INTENSITY_REF: 1.6,
    ELEV_RAY_FALLOFF: 55,
    ELEV_FACTOR_MIN: 0.45,
    ELEV_FACTOR_MAX: 0.95,
  },
  RENDER: {
    /** AgX tonemap exposure (scene + sky); runtime driven by sky reveal blend. */
    TONE_MAPPING_EXPOSURE: 0.1,
  },
  /** World-space texture scale (1 / meters per tile repeat). */
  TERRAIN_TEXTURE_REPEAT: 0.08,
  /** When world normal Y falls below this, blend terrain splat toward rock. */
  TERRAIN_SLOPE_ROCK_START: 0.75,
  TERRAIN_DISPLACEMENT_SCALE: 0.45,
  TERRAIN_NORMAL_STRENGTH: 1.0,
  TERRAIN_AO_STRENGTH: 0.85,
  TERRAIN_SPECULAR_STRENGTH: 0.35,
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
