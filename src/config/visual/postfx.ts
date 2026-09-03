// src/config/visual/postfx.ts — procedural grade + LUT

export const postfx = {
  grade: {
    enabled: true,
    lift: { r: 0, g: 0, b: 0 },
    /** Noon → goldenHourT. */
    elevation: {
      saturation: { atNoon: 1.0, atGoldenHour: 1.15 },
      contrast: { atNoon: 1.0, atGoldenHour: 1.04 },
      warmth: { atNoon: 0.0, atGoldenHour: 0.15 },
    },
    warmthTint: '#ffb870',
    /** After renderOutput; enable independent of grade.enabled. `.cube` reads size from file. */
    lut: {
      enabled: true,
      path: '/textures/grade/Other/Presetpro - Elite Chrome.cube',
      size: 32,
      strength: 0.8,
    },
  },
} as const;
