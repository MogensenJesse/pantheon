// src/config/visual/shadows.ts — shadow cascades (near PCSS, far, cloud, world) + per-TOD receive floors

const DEFAULT_SUN_MAP_SIZE = 8192;

const SHADOW_LIGHTING = {
  mapSize: DEFAULT_SUN_MAP_SIZE,
  farCoverageRadiusTexels: 16,
  shadowSoftnessMin: 2,
  shadowSoftnessMax: 512,
  shadowPenumbraScale: 900,
  shadowBias: 0.00025,
  shadowNormalBias: 0.05,
  /** Grass receive push toward the sun (m) against contact acne. */
  shadowContactPushM: 0.06,
  // Read at module load: full reload after change.
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
  /** Whole-map cascade beyond the ±200 m far map (play only). */
  world: {
    enabled: true,
    /** ≈1.5 m/texel at 2048. Full reload after change. */
    mapSize: 2048,
    /** Extra metres around the map in light view (tall peaks at low sun). */
    marginM: 64,
    /** Far→world handoff band inside the far map edge (m). */
    fadeBandM: 40,
    /** Re-bake when the sun turned this much; each bake is one jittered sample of the average. */
    refreshAngleDeg: 0.05,
    /** Caps bakes at 1000 / this per second (fast DEV day cycles). */
    refreshMinIntervalMs: 100,
    /** Re-bake when the player moved this far (prop LOD bins change what casts). */
    refreshMoveM: 64,
    /** Soft Vogel PCF radius on the world map. */
    filterRadiusTexels: 1.75,
    /** PCF taps. Full reload after change. */
    filterSamples: 8,
    /** Receiver offset along the terrain normal in the visibility resolve (m); coarse texels need more. */
    normalBias: 1.2,
    /**
     * Receiver push toward the sun (m) in the visibility resolve. Facet self-shadow comes from the
     * facet normal, so the depth test only resolves cast shadows: occluders closer than this (a
     * facet's neighbours, grazing slivers) are ignored.
     */
    pushM: 4,
    /**
     * Foliage casts via a mip-mapped alpha copy (cutouts have no mips, so metre-wide texels would
     * point-sample single needles). A texel occludes at this averaged coverage.
     */
    foliageAlphaTest: 0.3,
    /** Cells per side of the world-XZ visibility texture receivers read (4096 ≈ 0.5 m). Full reload after change. */
    visibilityRes: 4096,
    /**
     * Temporal supersampling: each bake shifts the map by a Halton offset of this many texels and
     * the resolve blends 1/`accumulateBakes` of it in (exponential average), so sub-texel casters
     * converge to smooth edges instead of swimming.
     */
    jitterTexels: 1,
    /** Blend window in bakes. With a still sun this many extra jittered bakes refine it, then baking stops. */
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
