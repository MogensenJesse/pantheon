// src/config/visual/postfx.ts — procedural grade + LUT (per TOD stop)

const LUT_DEFAULT = {
  enabled: false,
  path: '/textures/grade/Other/Presetpro - Elite Chrome.cube' as string | null,
  size: 32,
  strength: 0.8,
};

function gradeRegion(saturation: number, contrast: number, lift = { r: 0, g: 0, b: 0 }) {
  return { saturation, contrast, lift: { ...lift } };
}

const GRADE_STOP = {
  night: {
    shadows: gradeRegion(0.92, 0.98, { r: 0, g: -0.02, b: 0.06 }),
    midtones: gradeRegion(0.92, 0.98),
    highlights: gradeRegion(0.92, 0.98),
    warmth: -0.05,
    warmthTint: '#a8c0e0',
    lut: { ...LUT_DEFAULT },
  },
  goldenHour: {
    shadows: gradeRegion(1.15, 1.04, { r: 0.035, g: -0.06, b: 0.1 }),
    midtones: gradeRegion(1.15, 1.04, { r: 0.1, g: 0.04, b: 0.02 }),
    highlights: gradeRegion(1.15, 1.04, { r: 0.025, g: 0.005, b: 0.02 }),
    warmth: 0,
    warmthTint: '#ffb870',
    lut: { ...LUT_DEFAULT },
  },
  noon: {
    shadows: gradeRegion(1.0, 1.0),
    midtones: gradeRegion(1.0, 1.0),
    highlights: gradeRegion(1.0, 1.0),
    warmth: 0.0,
    warmthTint: '#ffb870',
    lut: { ...LUT_DEFAULT },
  },
} as const;

export const postfx = {
  grade: {
    /** Master enable for procedural grade (LUT enable is per-stop). */
    enabled: true,
    stops: GRADE_STOP,
  },
} as const;
