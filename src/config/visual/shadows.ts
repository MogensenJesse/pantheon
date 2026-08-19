// src/config/visual/shadows.ts — near PCSS ground + hard main map (godrays/cloud + far ground)

const DEFAULT_SUN_MAP_SIZE = 8192;

const SHADOW_LIGHTING = {
  /** Main sun map — godrays + cloud receive + ground beyond near ring. */
  mapSize: DEFAULT_SUN_MAP_SIZE,
  /** Far coverage Vogel PCF radius (texels). Higher = softer distant umbras. */
  farCoverageRadiusTexels: 1.5,
  /** PCSS penumbra at contact (texels). */
  shadowSoftnessMin: 2.5,
  /** PCSS penumbra cap for tall casters (texels). ≈1 m @ ±32 m / 8192. */
  shadowSoftnessMax: 128,
  /** Blocker gap → radius gain. */
  shadowPenumbraScale: 900,
  shadowBias: 0.00025,
  shadowNormalBias: 0.05,
  /** Terrain/grass sample push along sun (m). */
  shadowContactPushM: 0.06,
  /** Compile-time — full reload after change. */
  pcssBlockerSamples: 16,
  pcssFilterSamples: 32,
  pcssBlockerSearchTexels: 56,
  pcssBlockerMapSize: 1024,
  /** World-XZ Vogel cell (m). 0 = fixed phi. Live via DEV Shadows panel. */
  pcssVogelGridM: 0.05,
  /** Player-follow near cascade — ground receive (PCSS). */
  near: {
    halfExtentM: 32,
    /** Soft→far handoff band inside ortho halfExtent (m, light-view Chebyshev). */
    fadeBandM: 6,
    mapSize: DEFAULT_SUN_MAP_SIZE,
  },
} as const;

const SHADOW_RECEIVERS = {
  terrain: {
    /** Min lit in full shadow (0–1). */
    shadowFloor: 0.06,
  },
  grass: {
    shadowFloor: 0.25,
  },
  props: {
    shadowFloor: 0.4,
    shadowStrength: 0.9,
    shadowSampleLiftM: 0.12,
    nightColorFloor: 0.06,
    playerGlowMul: 0.35,
  },
  water: {
    shadowFloor: 0.3,
  },
} as const;

export const shadows = {
  lighting: SHADOW_LIGHTING,
  receivers: SHADOW_RECEIVERS,
} as const;

export { SHADOW_RECEIVERS };
