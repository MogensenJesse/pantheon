// src/config/visual/atmosphere.ts — valley + distance haze

const ATMOSPHERE_HAZE = {
  enabled: true,
  /** densityFogFactor density — distant dissolve (example ~0.0012). */
  hazeDensity: 0.002,
  /** World Y — solid fog below (valley floor). */
  fogBase: 8,
  /** World Y — band fades out by at night (mid-hills / mist ceiling). */
  fogTop: 30,
  /** World Y — band top recedes to this on clear day (before cycle lift at dusk). */
  fogTopDay: 14,
  bandStrength: 1,
  noiseScaleA: 0.01,
  noiseScaleB: 0.015,
  noiseAmplitude: 30,
  /** 0 = static band, 1 = full triNoise3D wisp animation. */
  noiseStrength: 0.35,
  nightColor: '#1a2230',
  dayColor: '#d0dee7',
  /** Sun elevation (°) at/above which fog/haze master ≈ 0 (clear midday). */
  clearElevationDeg: 30,
  /** Sun elevation (°) at/below which fog/haze master = 1 (night / deep dusk). */
  fullElevationDeg: -5,
  /** >1 keeps afternoons clearer longer before mist builds (1 = linear ramp). */
  cyclePower: 1.4,
} as const;

export const atmosphere = {
  haze: ATMOSPHERE_HAZE,
} as const;
