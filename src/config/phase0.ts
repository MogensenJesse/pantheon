// src/config/phase0.ts — Phase 0 tunables (scatter, landmarks, whisper)
export const PHASE0 = {
  ORB_COUNT: 26,
  SCATTER: {
    GRASS_OPEN_COUNT: 0,
    TREE_PATH_COUNT: 55,
    TREE_OPEN_COUNT: 18,
    TREE_FOREST_COUNT: 55,
    FOREST_UNDERSTORY_COUNT: 90,
    HILL_ROCKS_COUNT: 50,
    SHORE_PLANTS_COUNT: 50,
    MOUNTAIN_ROCKS_COUNT: 50,
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
    LAYER: 1,
    /** Selective bloom on emissive MRT (glow meshes only). */
    THRESHOLD: 0.2,
    SMOOTH_WIDTH: 0.045,
    STRENGTH: 0.2,
    STRENGTH_HIGH: 1.45,
    /** Keep radius moderate — high values look square/blocky on small orbs. */
    RADIUS: 1,
    RADIUS_HIGH: 0.48,
    /**
     * Scene-output bloom: emissive MRT alone is often empty in practice, so a
     * high-threshold pass on `output` (which includes emissive) restores visible
     * halos without washing the whole frame.
     */
    SCENE_THRESHOLD: 0.92,
    SCENE_STRENGTH_MUL: 0.5,
    /** Scene-output bloom only by default; emissive pass is redundant for visible glow. */
    USE_EMISSIVE_BLOOM: false,
    HDR_SCALE: 4.25,
    PLAYER_EMISSIVE: 1.25,
    /** Bloom-only tuning; scene pass stays full resolution (see PostFX.setRenderQuality). */
    RESOLUTION_SCALE_LOW: 0.5,
    RESOLUTION_SCALE_HIGH: 1.0,
  },
  RENDER: {
    TONE_MAPPING_EXPOSURE: 0.9,
  },
  /** World-space texture scale (1 / meters per tile repeat). */
  TERRAIN_TEXTURE_REPEAT: 0.08,
  /** Tileable ground cover from `forest-2` pack (`models/textures/forest-2`). */
  /** GPU grass coverage — see GrassCoverage.ts / GrassBlade.ts */
  GRASS: {
    GRID_RES: 256,
    CELL_MAX_BLADES: 3,
    DENSITY_SCALE: 1.0,
    DENSITY_THRESHOLD: 0.08,
    CHUNK_SIZE: 32,
    SHORE_GRASS_SPARSITY: 0.25,
    BLADE_HEIGHT: 0.72,
    BLADE_HEIGHT_MIN: 0.45,
    BLADE_WIDTH: 0.14,
    BLADE_SEGMENTS: 6,
    BLADE_BEND_MIN: 0.15,
    BLADE_BEND_MAX: 0.55,
    BLADE_WIDE_RATIO: 0.3,
    BLADE_WIDE_WIDTH_MUL: 1.6,
    BLADE_WIDE_HEIGHT_MUL: 0.72,
    SURFACE_LIFT: 0.03,
    COLOR_TINT: { r: 1.0, g: 1.05, b: 0.88 },
    COLOR_BASE: 0x3d6a2a,
    COLOR_TIP: 0x9bc561,
    COLOR_DRY: 0xa8b842,
    PATCH_NOISE_SCALE: 0.05,
    PATCH_NOISE_STRENGTH: 0.35,
    AO_STRENGTH: 0.45,
    RIM_STRENGTH: 0.25,
    SSS_STRENGTH: 0.2,
    WIND_SPEED: 1.65,
    WIND_STRENGTH: 0.06,
    ALPHA_TEST: 0.2,
  },
  TERRAIN_GROUND_COVER: {
    STRENGTH: 0.38,
    /** UV scale multiplier vs biome splat (breaks up tiling sync with forest/shore). */
    REPEAT_MUL: 1.2,
    /** Fixed roughness when cover blends in (avoids extra fragment texture sample). */
    ROUGHNESS: 0.82,
    /** forest-2 albedo is brown leaf litter — tint pushes a grassy read on splat. */
    COLOR_TINT: { r: 0.62, g: 1.22, b: 0.52 },
  },
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
