// src/config/visual/postfx.ts — cohesion + procedural grade / LUT

export const postfx = {
  cohesion: {
    enabled: true,
    /** Bell-curve sharpness: higher = tighter golden-hour peak. */
    goldenHourPower: 1.4,
    /** Scene bloom add multiplier (noon → golden hour). */
    bloomSceneWeight: { atNoon: 0.8, atGoldenHour: 1.12 },
    /**
     * Extra multiplier on god-ray pass weight (after sun intensity) — same golden-hour curve
     * as bloom (peaks at low sun). `syncPostFxCohesion` also multiplies by the elevation-
     * above-horizon ramp so the golden-hour boost cannot amplify a soft occluded edge.
     */
    godraysWeight: { atNoon: 0.45, atGoldenHour: 1.15 },
    /** During energy reveal only: soften vignette darkness at golden hour (0 = off). */
    vignetteDarknessBleed: 0.12,
  },
  /** Display-referred procedural grade on AgX; creative LUT after renderOutput. */
  grade: {
    enabled: true,
    saturation: 1.0,
    contrast: 1.0,
    lift: { r: 0, g: 0, b: 0 },
    elevation: {
      saturation: { atNoon: 1.0, atGoldenHour: 1.15 },
      contrast: { atNoon: 1.0, atGoldenHour: 1.04 },
      warmth: { atNoon: 0.0, atGoldenHour: 0.15 },
    },
    warmthTint: '#ffb870',
    /**
     * Display creative LUT (Presetpro / Other) — sampled after renderOutput.
     * `.cube` — LUT_3D_SIZE read from file (size hint ignored).
     * `.png` — horizontal strip (width = size², height = size); set `size` (default 32 → 1024×32).
     */
    lut: {
      enabled: true,
      path: '/textures/grade/Other/Presetpro - Elite Chrome.cube',
      size: 32,
      strength: 0.8,
    },
  },
} as const;
