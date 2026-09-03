// src/config/visual/postfx.ts — procedural grade / LUT
export const postfx = {
  /** Display-referred procedural grade on AgX; creative LUT after renderOutput. */
  grade: {
    enabled: true,
    lift: { r: 0, g: 0, b: 0 },
    /** Noon → golden-hour (`goldenHourT`). No extra global sat/contrast mul. */
    elevation: {
      saturation: { atNoon: 1.0, atGoldenHour: 1.15 },
      contrast: { atNoon: 1.0, atGoldenHour: 1.04 },
      warmth: { atNoon: 0.0, atGoldenHour: 0.15 },
    },
    warmthTint: '#ffb870',
    /**
     * Display creative LUT (Presetpro / Other) — sampled after renderOutput.
     * Enable is independent of procedural `grade.enabled`.
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
