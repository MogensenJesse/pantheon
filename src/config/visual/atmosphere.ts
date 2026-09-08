// src/config/visual/atmosphere.ts — valley + distance haze
//
// Look fields (tint, density, aerial, sky horizon) are per TOD stop via todWeights.
// Physical slab / inland distances stay shared; night-valley master still uses
// clearElevationDeg / fullElevationDeg for volume density (not look tint).

import { BELOW_HORIZON_ELEVATION_DEG } from './sky.ts';

/** Per-stop haze look — sampled via todWeights. */
const HAZE_LOOK_STOP = {
  night: {
    tint: '#152838',
    hazeDensity: 0.011,
    aerialStartM: 40,
    aerialEndM: 320,
    aerialStrength: 0.55,
    aerialNightMul: 0.45,
    skyHorizonStart: 0,
    skyHorizonEnd: 0.28,
  },
  goldenHour: {
    tint: '#E88840',
    hazeDensity: 0.008,
    aerialStartM: 30,
    aerialEndM: 520,
    aerialStrength: 0.55,
    aerialNightMul: 0.65,
    skyHorizonStart: 0,
    skyHorizonEnd: 0.4,
  },
  noon: {
    tint: '#5C64A1',
    hazeDensity: 0.0025,
    aerialStartM: 100,
    aerialEndM: 950,
    aerialStrength: 0.5,
    aerialNightMul: 0.65,
    skyHorizonStart: 0,
    skyHorizonEnd: 0.25,
  },
} as const;

const ATMOSPHERE_HAZE = {
  /** Compile-time off; live isolate = Perf → Disable valley fog / distance haze. */
  enabled: true,
  /** Cap on slab path length (m) so a long look does not become a solid wall. */
  valleyRayMaxM: 420,
  /** Extra optical path (m) under fogTop (near veil). */
  valleyAmbientM: 60,
  /** Quadratic density fade below fogTop (m); under ceiling, horizon/zenith use surround veil. */
  valleyEdgeFadeM: 56,
  /** Surround mix exponent on fade height (>1 = obscuring lags density). */
  valleyObscurePower: 2,
  /** Inland fade from map-edge ocean flood (lakes stay in pool). smoothstep on look XZ. */
  valleyInlandStartM: 40,
  valleyInlandEndM: 220,
  /** Slab floor — keep at/below water plane. */
  fogBase: 6,
  /** Night mist ceiling; peaks above stay clear. */
  fogTop: 88,
  /** Look stops (tint / density / aerial / sky horizon) — todWeights. */
  stops: HAZE_LOOK_STOP,
  /** Sun ° at/above which night valley master ≈ 0. */
  clearElevationDeg: 30,
  /** Sun ° at/below which fog/haze master = 1. */
  fullElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
  /** >1 = afternoons stay clearer longer. */
  cyclePower: 1.4,
} as const;

export const atmosphere = {
  haze: ATMOSPHERE_HAZE,
} as const;
