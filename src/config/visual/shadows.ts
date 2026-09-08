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
} as const;

/** Per-TOD artistic receive floors (PCSS sample counts stay global). */
export const SHADOW_RECEIVERS = {
  terrain: {
    shadowFloor: { night: 0.03, goldenHour: 0.04, noon: 0.01 },
  },
  grass: {
    shadowFloor: { night: 0.1, goldenHour: 0.2, noon: 0.06 },
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

export type ShadowsVisual = typeof shadows;
