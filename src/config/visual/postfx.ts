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
    shadows: gradeRegion(0.82, 1.08, { r: 0.0, g: -0.01, b: 0.06 }),
    midtones: gradeRegion(0.85, 1.04, { r: -0.02, g: 0.0, b: 0.03 }),
    highlights: gradeRegion(0.9, 1.02, { r: -0.01, g: 0.0, b: 0.02 }),
    warmth: -0.1,
    warmthTint: '#8AB0D0',
    lut: { ...LUT_DEFAULT },
  },
  goldenHour: {
    shadows: gradeRegion(1.22, 1.06, { r: 0.04, g: -0.05, b: 0.08 }),
    midtones: gradeRegion(1.25, 1.05, { r: 0.12, g: 0.05, b: 0.01 }),
    highlights: gradeRegion(1.2, 1.04, { r: 0.06, g: 0.02, b: 0.0 }),
    warmth: 0.15,
    warmthTint: '#FF9D2E',
    lut: { ...LUT_DEFAULT },
  },
  noon: {
    shadows: gradeRegion(1.2, 1.1, { r: 0.01, g: 0.0, b: 0.03 }),
    midtones: gradeRegion(1.24, 1.06, { r: 0.035, g: 0.02, b: 0.0 }),
    highlights: gradeRegion(1.16, 1.04, { r: 0.02, g: 0.01, b: 0.015 }),
    warmth: 0.05,
    warmthTint: '#FFE8B0',
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
