// src/config/visual/atmosphere.ts — valley + distance haze
//
// Sun ° bands (same curve shape, different noon): HDRI −5→15, godrays −1→8,
// haze master −5→30 (cyclePower 1.4), goldenHourT peak 58° (goldenHourPower 1.4).
// HDRI horizonDim = luma; day skyHorizon* = aerial mix; night = Y-slab volume.

import { BELOW_HORIZON_ELEVATION_DEG } from './sky.ts';

const ATMOSPHERE_HAZE = {
  /** Compile-time off; live isolate = Perf → Disable valley fog / distance haze. */
  enabled: true,
  /** Night valley Beer-Lambert extinction (1/m) through fogBase..fogTop; path capped at valleyRayMaxM. */
  hazeDensity: 0.009,
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
  /** Moonlit mist — lighter than unlit terrain. */
  nightColor: '#3D4854',
  dayColor: '#d0dee7',
  /** Day camera-XZ aerial; live = aerialStrength × mix(aerialNightMul, 1, 1 − night master). */
  aerialStartM: 200,
  aerialEndM: 560,
  aerialStrength: 0.75,
  /** Fraction of aerialStrength at full night. */
  aerialNightMul: 0.65,
  /** SkyMesh/HDRI fog=false; day = |viewDir.y| × aerial; night = valley slab; combined 1-(1-d)(1-n). */
  skyHorizonStart: 0,
  skyHorizonEnd: 0.36,
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
