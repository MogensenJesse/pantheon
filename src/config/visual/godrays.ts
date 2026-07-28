// src/config/visual/godrays.ts — light shafts / god rays

export const godrays = {
  /**
   * Accumulation rate / cap. Keep maxDensity below typical density so shadow umbras
   * survive. Density still scales with sun, but not so hard that golden hour is invisible.
   */
  DENSITY_BASE: 0.75,
  MAX_DENSITY_BASE: 1,
  INTENSITY_MUL: 1,
  /**
   * Floor on composite blend once the sun clears the terrain silhouette — scaled by the
   * elevation-above-horizon ramp below. Keep modest so the floor does not read as haze.
   */
  WEIGHT_MIN: 0.5,
  WEIGHT_MAX: 1,
  /**
   * Smoothstep (° above the terrain-silhouette horizon, see `horizonOcclusion` below) for
   * god-ray blend + density — a short, fast ramp right as the sun crosses the horizon.
   */
  ELEV_WEIGHT_START_DEG: -1,
  ELEV_WEIGHT_END_DEG: 3,
  /**
   * Raymarch sample count along each god-ray. Higher = less banding, more GPU.
   * Live via DEV panel; blur sigma still needs reload.
   */
  RAYMARCH_STEPS: 120,
  /** Terrain-silhouette sampling toward the sun azimuth — true occlusion, not a fixed elevation guess. */
  horizonOcclusion: {
    /** Ray-march distance (m) — covers the authored map's visible mountain ridges. */
    maxDistanceM: 2000,
    /** Samples per ray along the march. */
    sampleCount: 24,
    /** Rays in the fan around the sun azimuth (robustness against a single narrow gap/peak). */
    rayFanCount: 3,
    /** Fan spread (°) centered on the sun azimuth. */
    rayFanSpreadDeg: 1,
    /** EMA smoothing rate (per second) — avoids frame-to-frame jitter as camera/sun move. */
    smoothRatePerSec: 2,
    /**
     * Hard-kill only when the sun is this many degrees *below* the raw silhouette.
     * Avoids killing golden-hour shafts that graze just under a ridge while still
     * zeroing weight when the disk is clearly behind terrain (EMA cannot leave residual).
     */
    hardOccludeMarginDeg: 2,
  },
  /** Light bilateral blur — high sigma smears shadow shafts into haze. */
  BLUR_SIGMA: 1,
  BLUR_SIGMA_COLOR: 0.06,
  EDGE_RADIUS: 0,
  EDGE_STRENGTH: 0,
  TINT_R: 1.28,
  TINT_G: 1.02,
  TINT_B: 0.82,
  SKY_LUMA_START: 0.55,
  SKY_LUMA_END: 1.6,
  /**
   * Buffer-depth near-reject (WebGPU depth: near≈0, far≈1). Kill only close ground wash;
   * mid/far (ridge gaps, sky) keep shafts where shadow contrast reads.
   */
  SKY_DEPTH_START: 0.35,
  SKY_DEPTH_END: 0.75,
  /** Falloff away from the light — higher = tighter shafts near the sun. */
  DISTANCE_ATTENUATION: 0.5,
  SUN_FACING_MIN: 0.55,
  SUN_FACING_MAX: 1,
  SUN_INTENSITY_REF: 1.35,
  ELEV_RAY_FALLOFF: 55,
  ELEV_FACTOR_MIN: 0.45,
  ELEV_FACTOR_MAX: 0.95,
} as const;
