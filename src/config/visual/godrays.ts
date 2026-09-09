// src/config/visual/godrays.ts — screen-space light shafts

/** Keep Samples slider max in sync. */
export const GODRAYS_MAX_SAMPLES = 128;

export const godrays = {
  SAMPLES: 128,
  /** Per-sample keep toward sun; closer to 1 = longer shafts. */
  DECAY: 0.94,
  DENSITY: 3,
  EXPOSURE: 0.4,
  WEIGHT_MUL: 0.55,
  /** After elev ramp — per TOD stop. */
  weight: {
    night: 0,
    goldenHour: 1,
    noon: 0.4,
  },
  /** Shaft color — per TOD stop (blended via todWeights). */
  tint: {
    night: '#6A7088',
    /** Legacy flat TINT ≈ #FFE6A6 warm shaft. */
    goldenHour: '#FBDF8C',
    noon: '#FFF2D8',
  },
  /** Shaft fade-in on sun elevation ° (not haze 30° / lighting 58°). */
  ELEV_WEIGHT_START_DEG: -1,
  ELEV_WEIGHT_END_DEG: 8,
  /** Linear view-distance fraction — distant trees occlude, not sky. */
  DEPTH_START: 0.9,
  DEPTH_END: 0.995,
  /** Sun emitter UV radius (screen heights, aspect-corrected). */
  SUN_CORE: 0.02,
  SUN_RADIUS: 0.18,
  OFFSCREEN_FADE: 0.5,
} as const;
