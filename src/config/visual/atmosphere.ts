// src/config/visual/atmosphere.ts — valley + distance haze

import { BELOW_HORIZON_ELEVATION_DEG } from './sky.ts';

const ATMOSPHERE_HAZE = {
  enabled: true,
  /** densityFogFactor density — distant dissolve (example ~0.0012). */
  hazeDensity: 0.002,
  /** World Y — solid fog below (valley floor). */
  fogBase: 14,
  /** World Y — band fades out by at night (mid-hills / mist ceiling). */
  fogTop: 55,
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
  /**
   * Always-on camera-XZ aerial (unless Disable haze / editor). Same numbers as the
   * old terrain-only flatten so hills, trees, grass, and water wash together at noon.
   */
  aerialStartM: 120,
  aerialEndM: 560,
  aerialStrength: 0.75,
  /**
   * SkyMesh / night HDRI stay `fog = false` (a far-clip dome would wash the whole sky).
   * |viewDir.y| band mixes toward the same fog tint as ground aerial (0 = horizon).
   */
  skyHorizonStart: 0,
  skyHorizonEnd: 0.36,
  /** Sun elevation (°) at/above which night valley master ≈ 0 (clear midday). */
  clearElevationDeg: 30,
  /** Sun elevation (°) at/below which fog/haze master = 1 (night / deep dusk). */
  fullElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
  /** >1 keeps afternoons clearer longer before mist builds (1 = linear ramp). */
  cyclePower: 1.4,
} as const;

export const atmosphere = {
  haze: ATMOSPHERE_HAZE,
} as const;
