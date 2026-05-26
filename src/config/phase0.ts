// src/config/phase0.ts — Phase 0 tunables (scatter, landmarks, whisper)
export const PHASE0 = {
  ORB_COUNT: 26,
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
    /** Sun intensity at full reveal (matches WorldReveal). */
    SUN_INTENSITY_MAX: 1.6,
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
    SCENE_THRESHOLD: 0.92,
    SCENE_STRENGTH_MUL: 0.5,
    HDR_SCALE: 4.25,
    PLAYER_EMISSIVE: 1.25,
    RESOLUTION_SCALE_HIGH: 1.0,
  },
  RENDER: {
    TONE_MAPPING_EXPOSURE: 0.9,
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
