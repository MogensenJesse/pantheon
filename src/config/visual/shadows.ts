// src/config/visual/shadows.ts — near PCSS + main sun map (+ per-TOD artistic floors)

const DEFAULT_SUN_MAP_SIZE = 8192;

const SHADOW_LIGHTING = {
  mapSize: DEFAULT_SUN_MAP_SIZE,
  farCoverageRadiusTexels: 16,
  shadowSoftnessMin: 2,
  shadowSoftnessMax: 512,
  shadowPenumbraScale: 900,
  shadowBias: 0.00025,
  shadowNormalBias: 0.05,
  shadowContactPushM: 0.06,
  /** Full reload after change. */
  pcssBlockerSamples: 16,
  pcssFilterSamples: 32,
  pcssBlockerSearchTexels: 56,
  pcssBlockerMapSize: 1024,
  pcssVogelGridM: 0.05,
  near: {
    halfExtentM: 32,
    fadeBandM: 6,
    mapSize: DEFAULT_SUN_MAP_SIZE,
  },
  /**
   * Coarse whole-map cascade beyond the ±200 m far map (play only). Re-baked only when the
   * sun turns by `refreshAngleDeg` or the player moves `refreshMoveM` (prop LOD changes).
   */
  world: {
    enabled: true,
    /** 2048 over the whole map ≈ 1.4 m / texel. Full reload after change. */
    mapSize: 2048,
    /** Extra metres around the map in light-view (covers tall peaks at low sun). */
    marginM: 64,
    /** Far→world handoff band inside the far map edge (m). */
    fadeBandM: 40,
    /** Sub-texel steps (~1 m on far ridges at 35°) so re-bakes read as continuous motion. */
    refreshAngleDeg: 0.05,
    /** Cap re-bakes to ≤ 1000 / this per second (fast DEV day cycles). */
    refreshMinIntervalMs: 100,
    refreshMoveM: 64,
    /** Soft Vogel PCF on the world map — hides sub-texel swimming of far caster shadows. */
    filterRadiusTexels: 1.75,
    /** Full reload after change. */
    filterSamples: 8,
    /** Receiver offset in world metres along the normal (coarse texels need more than near/far). */
    normalBias: 1.2,
    /**
     * Receiver push toward the sun (m) in the visibility resolve. Facet self-shadow comes from
     * the exact facet normal, so the depth test only resolves cast shadows; occluders closer
     * than this along the ray (a facet's own neighbours, grazing slivers) are ignored.
     */
    pushM: 4,
    /**
     * Foliage casts into the world map from a mipmapped alpha copy (cutout textures have no
     * mips, so coarse texels point-sampled single needles and sparkled every bake). A texel
     * occludes when its averaged needle coverage reaches this.
     */
    foliageAlphaTest: 0.3,
    /**
     * Receivers read a world-XZ visibility texture resolved from the world map, not the map
     * itself (its sun-rotated grid re-rasterises sub-texel casters differently every bake).
     * Cells per side over WORLD.SIZE (2048 ≈ 1 m). Full reload after change.
     */
    visibilityRes: 4096,
    /**
     * Temporal supersampling: each bake shifts the map by a sub-texel Halton offset of this
     * many texels and the resolve averages the last ~`accumulateBakes` bakes (1/N blend per
     * bake), so sub-texel casters converge to smooth, stable edges instead of swimming.
     * With a still sun, up to `accumulateBakes` extra jittered bakes refine, then baking stops.
     */
    jitterTexels: 1,
    accumulateBakes: 16,
  },
} as const;

/** Per-TOD artistic receive floors (PCSS sample counts stay global). */
export const SHADOW_RECEIVERS = {
  terrain: {
    shadowFloor: { night: 0.03, goldenHour: 0.04, noon: 0.01 },
    /** Fraction of direct sun light kept in full umbra (1 = shade differs by hue only). */
    shadeSunKeep: { night: 1, goldenHour: 0.6, noon: 0.6 },
  },
  grass: {
    shadowFloor: { night: 0.1, goldenHour: 0.3, noon: 0.4 },
  },
  props: {
    shadowFloor: { night: 0.22, goldenHour: 0.34, noon: 0.12 },
    shadowStrength: 0.95,
    shadowSampleLiftM: 0.12,
    colorFloor: { night: 0.03, goldenHour: 0.05, noon: 0.015 },
    playerGlowMul: 0.35,
  },
  water: {
    shadowFloor: { night: 0.12, goldenHour: 0.28, noon: 0.1 },
  },
} as const;

export const shadows = {
  lighting: SHADOW_LIGHTING,
  receivers: SHADOW_RECEIVERS,
} as const;
